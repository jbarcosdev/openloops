import { AgentStatus } from '@harness/agent-state'
import { LLMError } from '@clients/llm-error'
import { NATIVE_TOOL_NAMES } from '@services/tasks/entities/agent-task.entity'
import { useHarness, warehouseTools, makeTool, structured, bigListing, act, say, type ScriptedTurn } from '../support'

describe('AgiLoop', () => {
    const env = useHarness()
    const llm = env.llm
    let w: ReturnType<typeof warehouseTools>

    beforeEach(() => {
        w = warehouseTools()
    })

    describe('a complete flow', () => {
        beforeEach(async () => {
            llm.script(
                { reasoning: 'I need the item list first', state: { objective: 'find item 3', next: 'get it' }, actions: [act('t_search', { q: 'warehouse' })] },
                {
                    reasoning: 'Item 3 is in the results',
                    state: { objective: 'find item 3', progress: 'searched' },
                    actions: [
                        act('t_get', { id: '{{step_1_1.output.results[3].id}}' }),
                        act('save_context', { name: 'my note', content: '{"a":1}', description: 'd' }),
                        act('read_context', { name: 'out_1_1', path: 'results[1].id' }),
                    ],
                },
                say('Found id3 and saved a note.', { reasoning: 'Done' }),
            )
            await env.send(env.agent(w.tools), 'find item 3')
        })

        it('ends idle with the final reply and a completed task', async () => {
            const [task] = env.tasks()

            expect(task.status).toBe('completed')
            expect(task.summary).toMatch(/^Found/)
            expect(env.fast.calls).toBe(1)
        })

        it('uses the reasoning engine as the only skill that talks to the model', () => {
            expect(llm.calls).toHaveLength(3)
            expect(llm.calls.every(call => call.origin === 'reasoning_engine')).toBe(true)
        })

        it('sends the skill temperature and declares tools with tool choice none', () => {
            expect(llm.calls.every(call => call.temperature === 0.3)).toBe(true)
            expect(llm.calls.every(call => call.toolChoice === 'none')).toBe(true)
        })

        it('declares the natives (without search) plus every external tool when the catalog is small', () => {
            expect(llm.toolNames(0)).toEqual(['read_context', 'save_context', 'ask_user', 'respond', 't_search', 't_get', 't_delete'])
        })

        it('opens with the system message and the opening, with no notices yet', () => {
            const first = llm.call(0).messages

            expect(first).toHaveLength(2)
            expect(first[0].role).toBe('system')
            expect(llm.opening(0).INPUT.user_message).toBe('find item 3')
            expect(llm.opening(0).HARNESS).toBeUndefined()
        })

        it('reuses the opening byte for byte and shows the model its own previous turn', () => {
            const second = llm.call(1).messages

            expect(second).toHaveLength(4)
            expect(second[1].content).toBe(llm.call(0).messages[1].content)

            const previous = JSON.parse(second[2].content as string)
            expect(previous).toMatchObject({ reasoning: 'I need the item list first', state: { next: 'get it' }, actions: [{ tool: 't_search' }] })
        })

        it('does not repeat the user request after the first call', () => {
            expect(llm.lastMessage(1).INPUT).toBeUndefined()
            expect(JSON.stringify(llm.lastMessage(1))).not.toContain('find item 3')
        })

        it('keeps the history append-only and the system message constant', () => {
            for (let i = 1; i < llm.calls.length; i++) {
                const before = llm.call(i - 1).messages
                expect(llm.call(i).messages.slice(0, before.length - 1)).toEqual(before.slice(0, -1))
                expect(llm.call(i).messages[0]).toEqual(llm.call(0).messages[0])
            }
        })

        it('adds the budget notice to the observations', () => {
            expect(llm.harness(1).budget.turns_left).toBe(19)
        })

        it('offloads the large output and shows a stub with its reference', () => {
            const [observation] = llm.observations(1)

            expect(observation.ref).toBe('1_1')
            expect(observation.output.workspace_ref).toBe('out_1_1')
            expect(observation.output.note).toMatch(/^Partial view/)
        })

        it('resolves step references and reads inside the offloaded output', () => {
            expect(w.gets).toEqual(['id3'])

            const results = llm.observations(2)
            expect(results.map((o: any) => o.status)).toEqual(['completed', 'completed', 'completed'])
            expect(results[2].output.content).toBe('id1')
        })

        it('saves notes as structured content', () => {
            expect(env.workspaceItems().some(item => item.name === 'my_note' && item.content.a === 1)).toBe(true)
        })

        it('persists opening, reasoning and state with the task', () => {
            const [task] = env.tasks()

            expect(task.opening).toBe(llm.call(0).messages[1].content)
            expect(task.turns).toHaveLength(3)
            expect(task.turns[0].reasoning).toBe('I need the item list first')
            expect(task.turns[1].state.progress).toBe('searched')
        })

        it('persists the reasoning in the traces', () => {
            const reasoning = env.traces().filter(t => t.node === 'reasoning_engine' && t.reasoning).map(t => t.reasoning)
            expect(reasoning).toEqual(['I need the item list first', 'Item 3 is in the results', 'Done'])
        })

        it('persists every action with its turn, including respond', () => {
            const actions = env.actions()

            expect(actions).toHaveLength(5)
            expect(actions.every(a => a.turn)).toBe(true)
            expect(actions.filter(a => a.name === 'respond')).toHaveLength(1)
        })

        it('stores the large output once, in the workspace, and only a stub in the action', () => {
            const search = env.actions().find(a => a.name === 't_search')!

            expect(search.output.workspace_ref).toBe('out_1_1')
            expect(JSON.stringify(search).length).toBeLessThan(6000)
            expect(env.workspaceItems().find(item => item.name === 'out_1_1')?.content.results).toHaveLength(3000)
        })
    })

    it('answers with the fast responder alone when it can', async () => {
        env.fast.canAnswer = true
        const result = await env.send(env.agent(w.tools), 'hi')

        expect(llm.calls).toHaveLength(0)
        expect(result.data.lastAnswer).toBe('fast answer')
        expect(env.tasks()).toHaveLength(0)
    })

    describe('medium sized outputs', () => {
        it('arrive in full the next cycle and as a stub after that', async () => {
            const medium = { rows: Array.from({ length: 600 }, (_, i) => ({ id: `m${i}`, label: 'y'.repeat(30) })) }
            const tools = [...w.tools, makeTool({ name: 't_medium', description: 'returns a medium sized list', handler: async () => structured(medium) })]
            llm.script(
                { reasoning: 'list first', state: { objective: 'list' }, actions: [act('t_medium', {})] },
                { reasoning: 'noted', state: { objective: 'list', progress: 'rows seen' }, actions: [act('t_get', { id: 'x' })] },
                say('done'),
            )
            await env.send(env.agent(tools), 'list rows')

            expect(llm.observations(1)[0].output.rows).toHaveLength(600)

            const stub = JSON.parse(llm.call(2).messages[3].content as string).OBSERVATIONS[0].output
            expect(stub.workspace_ref).toBe('out_1_1')
            expect(stub.rows).toBeUndefined()
            expect(stub.preview).toBeDefined()
            expect(stub.outline).toBeDefined()

            expect(llm.observations(2)[0].output.got).toBe('x')
            expect(llm.call(2).messages.slice(0, 2)).toEqual(llm.call(1).messages.slice(0, 2))

            const persisted = env.actions().find(a => a.name === 't_medium')!
            expect(persisted.output.workspace_ref).toBe('out_1_1')
            expect(persisted.output.rows).toBeUndefined()
        })
    })

    describe('errors reach the model', () => {
        it('adds the not found directive and does not cut declared descriptions', async () => {
            const longDescription = 'tutorial '.repeat(330)
            const tools = [...w.tools, makeTool({ name: 't_missing', description: longDescription, handler: async () => { throw new Error("Site not found: 'x'. Did you mean: ['Y']?") } })]
            llm.script({ state: { objective: 'x' }, actions: [act('t_missing', {})] }, say('stopping'))
            await env.send(env.agent(tools), 'find x')

            const [failed] = llm.observations(1)
            expect(failed.status).toBe('failed')
            expect(failed.error).toContain("Did you mean: ['Y']")
            expect(failed.error).toContain('Harness note')
            expect(llm.call(0).tools?.find(t => t.name === 't_missing')?.description).toHaveLength(longDescription.length)
        })

        it('does not run again a call that already failed, but retries transient failures', async () => {
            let broken = 0
            let flaky = 0
            const tools = [
                ...w.tools,
                makeTool({ name: 't_broken', handler: async () => { broken++; throw new Error('Ambiguous site name') } }),
                makeTool({ name: 't_flaky', handler: async () => { flaky++; throw new Error('503 service unavailable') } }),
            ]
            const both = { actions: [act('t_broken', { site: 'x' }), act('t_flaky', {})] }
            llm.script(both, both, say('stop'))
            await env.send(env.agent(tools), 'try')

            const [repeatBroken, repeatFlaky] = llm.observations(2)
            expect(broken).toBe(1)
            expect(repeatBroken.error).toContain('already failed')
            expect(repeatBroken.error).toContain('Ambiguous site name')
            expect(flaky).toBe(2)
            expect(repeatFlaky.error).not.toContain('already failed')
        })

        it('reports every kind of malformed action with a clear message', async () => {
            const arrays = [act('ask_user', {}), act('search_tools', { keywords: [{ keyword: 'get', weight: 1 }] }), act('t_get', { wrong: 1 }), act('missing_tool', {}), {} as any, act('respond', {}), act('t_get', '{"id":"7"}'), act('t_get', '[1]')]
            llm.script({ actions: arrays }, say('ok'))
            await env.send(env.agent(w.tools), 'bad calls')

            const [ask, search, invalid, missing, noTool, noAnswer, asString, notObject] = llm.observations(1)

            expect(ask.error).toContain('question')
            expect(search.error).toContain('not in your tool list')
            expect(invalid.error).toContain('Invalid arguments')
            expect(missing.error).toContain('not in your tool list')
            expect(noTool.error).toContain('"tool"')
            expect(noAnswer.error).toContain('answer')
            expect(asString.status).toBe('completed')
            expect(w.gets).toContain('7')
            expect(notObject.error).toContain('JSON object')
        })

        it('turns an empty action list into an error observation', async () => {
            llm.script({ actions: [] }, say('ok'))
            await env.send(env.agent(w.tools), 'empty')

            expect(llm.observations(1)[0]).toMatchObject({ tool: 'invalid_response', status: 'failed' })
            expect(llm.observations(1)[0].error).toContain('no actions')
        })

        it('surfaces unparseable model output as a run error', async () => {
            llm.script({ raw: 'not json at all' })
            const result = await env.send(env.agent(w.tools), 'garbage')

            expect(result.error).toBeDefined()
        })
    })

    describe('confirmation gate', () => {
        it('pauses a destructive call and runs it once after confirmation', async () => {
            llm.script({ actions: [act('t_delete', { id: '9' })] }, () => say('Do you want me to delete item 9?'), say('Item 9 deleted.'))
            const agent = env.agent(w.tools)

            let result = await env.send(agent, 'delete 9')
            const chatId = result.data._id.toString()

            expect(w.deleted).toEqual([])
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(result.data.lastAnswer).toBe('Do you want me to delete item 9?')
            expect(llm.call(1).toolChoice).toBe('none')
            expect(llm.call(1).messages).toHaveLength(2)
            expect(llm.opening(1).HARNESS.pending_confirmation[0].tool).toBe('t_delete')
            expect(env.task().turns).toHaveLength(1)

            result = await env.send(agent, 'yes', chatId)

            expect(result.error).toBeUndefined()
            expect(w.deleted).toEqual(['9'])
            expect(env.fast.calls).toBe(1)
            expect(llm.observations(2)[0]).toMatchObject({ tool: 't_delete', status: 'completed' })
            expect(result.data.lastAnswer).toBe('Item 9 deleted.')
            expect(result.data.state.status).toBe(AgentStatus.IDLE)
        })

        it('cancels the task when the user declines', async () => {
            llm.script({ actions: [act('t_delete', { id: '5' })] }, () => say('Delete 5?'))
            const agent = env.agent(w.tools)
            let result = await env.send(agent, 'delete 5')

            env.gate.decision = 'DECLINED'
            result = await env.send(agent, 'no', result.data._id.toString())

            expect(w.deleted).toEqual([])
            expect(result.data.lastAnswer).toBe('cancelled ok')
            expect(env.task().status).toBe('cancelled')
        })

        it('keeps waiting when the reply is unclear', async () => {
            llm.script({ actions: [act('t_delete', { id: '1' })] }, () => say('Delete 1?'))
            const agent = env.agent(w.tools)
            let result = await env.send(agent, 'delete 1')

            env.gate.decision = 'UNCLEAR'
            result = await env.send(agent, 'hmm', result.data._id.toString())

            expect(w.deleted).toEqual([])
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(result.data.lastAnswer).toBe('sure?')
        })
    })

    describe('ask_user', () => {
        it('pauses with the question and resumes with the answer as an observation and a known fact', async () => {
            llm.script({ state: { next: 'ask' }, actions: [act('ask_user', { question: 'Which warehouse?' })] }, say('Using the second one.'))
            const agent = env.agent(w.tools)

            let result = await env.send(agent, 'check stock')
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(result.data.lastAnswer).toBe('Which warehouse?')

            result = await env.send(agent, 'the second one', result.data._id.toString())

            expect(env.fast.calls).toBe(1)
            expect(llm.observations(1)[0]).toMatchObject({ tool: 'ask_user', output: { answer: 'the second one' } })

            const [key, value] = Object.entries(llm.harness(1).known ?? {}).find(([name]) => name.startsWith('user_answer_')) ?? []
            expect(key).toBeDefined()
            expect(value).toContain('the second one')
            expect(value).toContain('Which warehouse?')

            expect(llm.opening(1).INPUT.user_message).toBe('check stock')
            expect(llm.call(1).messages).toHaveLength(4)
            expect(result.data.lastAnswer).toBe('Using the second one.')
            expect(result.data.state.status).toBe(AgentStatus.IDLE)
        })
    })

    describe('limits', () => {
        const forcedAnswer = (text: string): ScriptedTurn => say(text)

        it('forces a final answer when the turn budget is exhausted and ignores the other actions', async () => {
            llm.repeat(30, (params, i) => lastHarness(params).stop_reason
                ? say('giving up politely', { actions: [act('t_get', { id: 'z' }), act('respond', { answer: 'giving up politely' })] })
                : { actions: [i % 2 ? act('search_tools', { keywords: [{ keyword: `x${i}`, weight: 1 }] }) : act('t_get', { id: `x${i}` })] })
            const result = await env.send(env.agent(w.tools), 'loop forever')

            expect(result.error).toBeUndefined()
            expect(llm.calls).toHaveLength(21)
            expect(llm.harness(20).stop_reason).toBeDefined()
            expect(env.task().status).toBe('failed')
            expect(result.data.lastAnswer).toBe('giving up politely')
            expect(w.gets).not.toContain('z')
        })

        it('warns after three turns on the same tool and stops at six', async () => {
            llm.repeat(12, (params, i) => lastHarness(params).stop_reason ? forcedAnswer('I could not find it, stopping.') : { reasoning: 'again', actions: [act('t_get', { id: `q${i}` })] })
            const result = await env.send(env.agent(w.tools), 'loop forever')

            expect(llm.calls.findIndex((_, i) => llm.harness(i).warning)).toBe(3)
            expect(llm.calls).toHaveLength(7)
            expect(llm.harness(6).stop_reason).toContain('t_get')
            expect(env.task().status).toBe('failed')
            expect(result.data.lastAnswer).toContain('stopping')
        })

        it('warns and stops a run that only reads and saves workspace notes', async () => {
            const rotate = (i: number) => (i % 2 ? act('save_context', { name: `n${i}`, content: 'x' }) : act('read_context', { name: `missing${i}` }))
            llm.repeat(12, (params, i) => lastHarness(params).stop_reason ? forcedAnswer('no progress, stopping') : { actions: [rotate(i)] })
            const result = await env.send(env.agent(w.tools), 'go around in circles')

            expect(llm.calls.some((_, i) => String(llm.harness(i).warning ?? '').length)).toBe(true)
            expect(llm.calls.length).toBeLessThanOrEqual(9)
            expect(llm.harness(llm.calls.length - 1).stop_reason).toBeDefined()
            expect(result.data.lastAnswer).toContain('stopping')
        })

        it('allows identical calls (the loop does not block duplicates)', async () => {
            llm.script({ actions: [act('t_get', { id: 'same' })] }, { actions: [act('t_get', { id: 'same' })] }, say('done'))
            await env.send(env.agent(w.tools), 'repeat')

            expect(w.gets).toEqual(['same', 'same'])
        })
    })

    describe('final answer grounding', () => {
        const INVENTED = '2e8f5f4fbc3e4f3285b3332508653630'

        it('rejects an answer that cites an identifier found nowhere, once, and then lets the model fix it', async () => {
            llm.script(say(`El sitio es ${INVENTED}`), say('No encontré el sitio.'))
            const result = await env.send(env.agent(w.tools), 'cual es el sitio')

            expect(llm.calls).toHaveLength(2)
            expect(llm.observations(1)[0].status).toBe('failed')
            expect(llm.observations(1)[0].error).toContain(INVENTED)
            expect(result.data.lastAnswer).toBe('No encontré el sitio.')
        })

        it('lets through an answer that cites an identifier from a result', async () => {
            const real = '7133dbb1bc3d43d79ef5e720e577f8aa'
            const tools = [...w.tools, makeTool({ name: 't_list', handler: async () => structured({ items: [{ id: real }] }) })]
            llm.script({ actions: [act('t_list', {})] }, say(`Es ${real}`))
            const result = await env.send(env.agent(tools), 'lista')

            expect(result.data.lastAnswer).toBe(`Es ${real}`)
            expect(llm.calls).toHaveLength(2)
        })
    })

    describe('tool names', () => {
        it('tolerates a "functions." prefix, respond included', async () => {
            llm.script({ actions: [act('functions.t_get', { id: 'ns' })] }, { actions: [act('functions.respond', { answer: 'prefixed ok' })] })
            const result = await env.send(env.agent(w.tools), 'prefixed names')

            expect(w.gets).toContain('ns')
            expect(result.data.lastAnswer).toBe('prefixed ok')
            expect(env.task().status).toBe('completed')
        })

        describe('with a server', () => {
            let ran: string[]
            let tools: ReturnType<typeof makeTool>[]

            beforeEach(() => {
                ran = []
                tools = [
                    makeTool({ name: 'srv__search_tools', required: ['query'], properties: { query: { type: 'string' } }, handler: async (p) => { ran.push(`search:${p.query}`); return structured({ tools: [] }) } }),
                    makeTool({ name: 'srv__wipe', destructive: true, handler: async () => { ran.push('wipe'); return structured({ ok: true }) } }),
                ]
            })

            it('runs the declared tool when the prefix is missing or the case differs, and says so', async () => {
                llm.script({ actions: [act('search_tools', { query: 'audit' }), act('SRV__search_tools', { query: 'again' })] }, say('done'))
                await env.send(env.agent(tools), 'find')

                const [first, second] = llm.observations(1)
                expect(ran).toEqual(['search:audit', 'search:again'])
                expect(first).toMatchObject({ tool: 'srv__search_tools', status: 'completed' })
                expect(first.note).toContain('srv__search_tools')
                expect(second.tool).toBe('srv__search_tools')
                expect(JSON.parse(llm.call(1).messages[2].content as string).actions[0].tool).toBe('srv__search_tools')
            })

            it('still asks for confirmation when a destructive tool was resolved by name', async () => {
                llm.script({ actions: [act('wipe', {})] }, say('asked'))
                const result = await env.send(env.agent(tools), 'wipe it')

                expect(ran).not.toContain('wipe')
                expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            })

            it('does not correct an ambiguous name and lists the candidates', async () => {
                const two = [...tools, makeTool({ name: 'other__search_tools' })]
                llm.script({ actions: [act('search_tools', { query: 'a' })] }, say('done'))
                await env.send(env.agent(two), 'find')

                const [observation] = llm.observations(1)
                expect(observation.status).toBe('failed')
                expect(observation.error).toContain('srv__search_tools')
                expect(observation.error).toContain('other__search_tools')
                expect(observation.note).toBeUndefined()
                expect(ran).toEqual([])
            })
        })
    })

    describe('hidden tools behind an invoke tool', () => {
        const listing = structured({ tools: [{ name: 'run_audit', description: 'd', input_schema: { type: 'object', properties: { site: { type: 'string' } }, required: ['site'] } }] })
        let called: Record<string, any>[]
        let tools: ReturnType<typeof makeTool>[]

        beforeEach(() => {
            called = []
            tools = [
                makeTool({ name: 'z__search_tools', required: ['query'], properties: { query: { type: 'string' } }, handler: async () => listing }),
                makeTool({ name: 'z__invoke_tool', required: ['name', 'arguments'], properties: { name: { type: 'string' }, arguments: { type: 'object' } }, handler: async (p) => { called.push({ name: p.name, arguments: p.arguments }); return structured({ ok: true }) } }),
            ]
        })

        it('routes a tool seen in a search through the invoke tool with its bare name', async () => {
            llm.script(
                { actions: [act('z__search_tools', { query: 'audit' })] },
                { actions: [act('z__run_audit', { site: 'B' })] },
                say('done'),
            )
            await env.send(env.agent(tools), 'audit B')

            expect(called).toEqual([{ name: 'run_audit', arguments: { site: 'B' } }])
            expect(llm.harness(1).schemas).toEqual({ run_audit: { required: ['site (string)'], optional: [] } })

            const routed = llm.observations(2)[0]
            expect(routed.tool).toBe('z__invoke_tool')
            expect(routed.note).toContain('hidden tool')
        })

        it('explains how to call a hidden tool that was never seen', async () => {
            llm.script({ actions: [act('z__run_audit', { site: 'B' })] }, say('done'))
            await env.send(env.agent(tools), 'audit B')

            const [observation] = llm.observations(1)
            expect(observation.status).toBe('failed')
            expect(observation.error).toContain('hidden tool')
            expect(observation.error).toContain('"name":"run_audit"')
            expect(called).toEqual([])
        })
    })

    describe('large catalogs', () => {
        it('declares only the natives at first and appends discovered tools to the list', async () => {
            const many = [
                ...w.tools,
                ...Array.from({ length: 16 }, (_, i) => makeTool({ name: `big__tool_${i}`, description: i === 7 ? 'sync warehouse inventory report' : `misc ${i}`, properties: { n: { type: 'string' } }, handler: async () => ({ fine: i }) })),
                makeTool({ name: 'bad name with spaces', description: 'invalid for providers' }),
            ]
            llm.script({ actions: [act('search_tools', { keywords: [{ keyword: 'inventory', weight: 1 }] })] }, { actions: [act('big__tool_7', { n: 'x' })] }, say('big done'))
            const result = await env.send(env.agent(many), 'sync inventory')

            expect(result.error).toBeUndefined()
            expect(result.data.lastAnswer).toBe('big done')
            expect(llm.toolNames(0)).toEqual(NATIVE_TOOL_NAMES)

            const context = llm.opening(0).CONTEXT
            expect(context.total_tools).toBe(19)
            expect(context.tool_sources.map((s: any) => `${s.name}:${s.tool_count}`)).toEqual(['local:3', 'big:16'])

            expect(llm.toolNames(1)).toEqual([...NATIVE_TOOL_NAMES, 'big__tool_7'])
            expect(llm.toolNames(2).at(-1)).toBe('big__tool_7')
            expect(llm.call(2).tools).toEqual(llm.call(1).tools)
            expect(llm.observations(2)[0].output.fine).toBe(7)
        })
    })

    describe('chat continuity', () => {
        it('gives a new task the chat history and the previous task summary, with a fresh thread', async () => {
            const agent = env.agent(w.tools)
            llm.script(say('Hello there'))
            let result = await env.send(agent, 'hi')

            llm.script(say('Second answer'))
            result = await env.send(agent, 'again', result.data._id.toString())

            const context = llm.opening(1).CONTEXT
            expect(context.chat_history.map((m: any) => m.content)).toEqual(['hi', 'Hello there'])
            expect(context.last_completed_task.goal).toBe('hi')
            expect(llm.call(1).messages).toHaveLength(2)
        })
    })

    describe('known facts and schemas', () => {
        it('returns learned facts in the next notice and persists them', async () => {
            llm.script(
                { actions: [act('t_get', { id: '1' })], learned: [{ key: 'Site', value: 'Alpha id=111' }, { key: 'owner', value: { name: 'x' } }, { key: '', value: 'skip' }, { value: 'nokey' }] },
                { actions: [act('t_get', { id: '2' })], learned: [{ key: 'site', value: 'Alpha id=222' }, { key: 'long', value: 'z'.repeat(1000) }] },
                say('done'),
            )
            await env.send(env.agent(w.tools), 'learn')

            expect(llm.harness(0).known).toBeUndefined()
            expect(llm.harness(1).known).toEqual({ Site: 'Alpha id=111', owner: '{"name":"x"}' })

            const known = llm.harness(2).known
            expect(Object.keys(known)).toEqual(['owner', 'site', 'long'])
            expect(known.long).toHaveLength(300)
            expect(env.task().known.site).toBe('Alpha id=222')
        })

        it('returns the schemas seen in a result and persists them', async () => {
            const finder = makeTool({
                name: 'srv__find',
                handler: async () => structured({ tools: [{ name: 'get_health', description: 'd', input_schema: { type: 'object', properties: { site: { type: 'string' }, hours: { anyOf: [{ type: 'number' }, { type: 'null' }] } }, required: ['site'] } }] }),
            })
            llm.script({ actions: [act('srv__find', {})] }, say('done'))
            await env.send(env.agent([finder]), 'schemas')

            expect(llm.harness(1).schemas).toEqual({ get_health: { required: ['site (string)'], optional: ['hours (number)'] } })
            expect(env.task().schemas.get_health.required[0]).toBe('site (string)')
        })
    })

    describe('model errors', () => {
        it('reports a provider error to the user without losing the chat', async () => {
            llm.script({ throws: LLMError.fromProvider('503 service unavailable') })
            const result = await env.send(env.agent(w.tools), 'hola')

            expect(result.error).toBeDefined()
            expect(result.error).toContain('temporarily unavailable')
        })
    })

    describe('parallel actions', () => {
        it('runs every action of a turn and shows all observations in order', async () => {
            llm.script({ actions: [act('t_get', { id: 'a' }), act('t_get', { id: 'b' }), act('t_get', { id: 'c' })] }, say('done'))
            await env.send(env.agent(w.tools), 'three')

            expect(w.gets.sort()).toEqual(['a', 'b', 'c'])
            expect(llm.observations(1).map((o: any) => o.ref)).toEqual(['1_1', '1_2', '1_3'])
        })
    })
})

function lastHarness (params: { messages: { content: unknown }[] }): Record<string, any> {
    const last = params.messages[params.messages.length - 1]
    return JSON.parse(last.content as string).HARNESS ?? {}
}
