import { Agent } from '@harness/index'
import { AgentStatus } from '@harness/agent-state'
import { Guard } from '@guardrails/guard'
import { useHarness, warehouseTools, act, say, makeLoop } from '../support'

describe('confirmation of destructive calls', () => {
    const env = useHarness()
    const llm = env.llm
    let w: ReturnType<typeof warehouseTools>

    beforeEach(() => {
        w = warehouseTools()
        env.approval.question = 'Do you want me to delete item 9?'
    })

    async function ask () {
        llm.script({ actions: [act('t_delete', { id: '9' })] }, say('Item 9 deleted.'))
        const agent = env.agent(w.tools)
        const result = await env.send(agent, 'delete 9')

        return { agent, result, chatId: result.data._id.toString() }
    }

    describe('asking', () => {
        it('stops before the call and asks with the question of the approval skill', async () => {
            const { result } = await ask()

            expect(w.deleted).toEqual([])
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(result.data.lastAnswer).toBe('Do you want me to delete item 9?')
        })

        it('does not call the reasoning model again or spend a turn to phrase the question', async () => {
            await ask()

            expect(llm.calls).toHaveLength(1)
            expect(env.task().turns).toHaveLength(1)
        })

        it('gives the approval skill the goal and only the pending actions', async () => {
            await ask()

            expect(env.approval.calls).toHaveLength(1)
            expect(env.approval.calls[0].input.goal).toBe('delete 9')
            expect(env.approval.calls[0].input.pending_actions).toHaveLength(1)
            expect(env.approval.calls[0].input.pending_actions[0]).toMatchObject({ tool: 't_delete', args: { id: '9' } })
        })

        it('leaves the task ready to resume at the node that asked', async () => {
            await ask()

            expect(env.task().nextNode).toBe('action_engine')
            expect(env.traces().some(entry => entry.node === 'approval_request')).toBe(true)
        })

        it('runs the calls that need no approval and asks only about the destructive ones', async () => {
            llm.script({ actions: [act('t_get', { id: '1' }), act('t_delete', { id: '2' })] })
            await env.send(env.agent(w.tools), 'get 1 and delete 2')

            expect(w.gets).toEqual(['1'])
            expect(w.deleted).toEqual([])
            expect(env.approval.calls[0].input.pending_actions.map((a: any) => a.tool)).toEqual(['t_delete'])
        })

        it('falls back to a plain question when the skill returns none', async () => {
            env.approval.question = '   '
            const { result } = await ask()

            expect(result.data.lastAnswer).toBe('Do you confirm that I run t_delete?')
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
        })
    })

    describe('the reply', () => {
        it('runs the call once when the user confirms and gives the gate the question and the reply', async () => {
            const { agent, chatId } = await ask()

            const result = await env.send(agent, 'yes', chatId)

            expect(result.error).toBeUndefined()
            expect(w.deleted).toEqual(['9'])
            expect(env.gate.calls).toHaveLength(1)
            expect(env.gate.calls[0].contextInjection.pending_confirmation).toBe('Do you want me to delete item 9?')
            expect(env.gate.calls[0].userMessage).toBe('yes')
            expect(env.approval.calls).toHaveLength(1)
            expect(env.fast.calls).toBe(1)
            expect(llm.observations(1)[0]).toMatchObject({ tool: 't_delete', status: 'completed' })
            expect(result.data.lastAnswer).toBe('Item 9 deleted.')
            expect(result.data.state.status).toBe(AgentStatus.IDLE)
        })

        it('cancels the task and never runs the call when the user declines', async () => {
            const { agent, chatId } = await ask()

            env.gate.decision = 'DECLINED'
            const result = await env.send(agent, 'no', chatId)

            expect(w.deleted).toEqual([])
            expect(llm.calls).toHaveLength(1)
            expect(result.data.lastAnswer).toBe('cancelled ok')
            expect(result.data.state.status).toBe(AgentStatus.IDLE)
            expect(env.task().status).toBe('cancelled')
        })

        it('keeps waiting when the reply is unclear and accepts a later confirmation', async () => {
            const { agent, chatId } = await ask()

            env.gate.decision = 'UNCLEAR'
            const unclear = await env.send(agent, 'hmm', chatId)

            expect(w.deleted).toEqual([])
            expect(unclear.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(unclear.data.lastAnswer).toBe('sure?')

            env.gate.decision = 'CONFIRMED'
            const confirmed = await env.send(agent, 'yes, do it', chatId)

            expect(w.deleted).toEqual(['9'])
            expect(confirmed.data.state.status).toBe(AgentStatus.IDLE)
        })

        it('asks again for a new destructive call after the first one was confirmed', async () => {
            const { agent, chatId } = await ask()
            await env.send(agent, 'yes', chatId)

            llm.script({ actions: [act('t_delete', { id: '10' })] })
            const second = await env.send(agent, 'delete 10 as well', chatId)

            expect(w.deleted).toEqual(['9'])
            expect(second.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(env.approval.calls).toHaveLength(2)
        })

        it('still runs the post execution hooks when the harness handles the reply', async () => {
            const { agent, chatId } = await ask()
            let hooks = 0
            agent.addHook('post_execution', () => { hooks++ })

            env.gate.decision = 'DECLINED'
            await env.send(agent, 'no', chatId)

            expect(hooks).toBe(1)
        })

        it('keeps the question open when a guard blocks the reply', async () => {
            const { agent, chatId } = await ask()
            agent.addGuard(new Guard({ name: 'no_spam', type: 'input', reply: 'blocked', handler: ({ message }) => message === 'spam' ? { passed: false } : { passed: true } }))

            const blocked = await env.send(agent, 'spam', chatId)

            expect(blocked.data.messages.at(-1).content).toContain('blocked')
            expect(blocked.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(env.gate.calls).toHaveLength(0)

            const confirmed = await env.send(agent, 'yes', chatId)

            expect(env.gate.calls[0].contextInjection.pending_confirmation).toBe('Do you want me to delete item 9?')
            expect(w.deleted).toEqual(['9'])
            expect(confirmed.data.state.status).toBe(AgentStatus.IDLE)
        })
    })

    describe('in a loop that knows nothing about it', () => {
        const loop = () => makeLoop({
            initialNode: 'start',
            nodes: {
                start: async (ctx, harness) => {
                    const task = ctx.chat.createTask(ctx.currentMessage)
                    const actions = task.addTurn({ reasoning: 'r', actions: [{ tool: 't_delete', arguments: { id: '3' } }] }, { declaredTools: ['t_delete'] })

                    await harness.requestApproval(actions.filter(action => harness.requiresApproval(action)), { resumeAt: 'finish' })
                },
                finish: async (ctx, harness) => {
                    for (const action of ctx.task!.readyActions) await harness.runAction(action)

                    ctx.chat.completeTask(ctx.task!.id, 'done')
                    ctx.chat.state?.setStatus(AgentStatus.IDLE)
                    harness.reply('all done')
                },
            },
        })

        it('asks, resumes at the node it named and runs the call after confirmation', async () => {
            const agent = new Agent({ loop: loop(), tools: w.tools })
            const asked = await env.send(agent, 'delete 3')

            expect(w.deleted).toEqual([])
            expect(asked.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(asked.data.lastAnswer).toBe('Do you want me to delete item 9?')

            const done = await env.send(agent, 'yes', asked.data._id.toString())

            expect(w.deleted).toEqual(['3'])
            expect(done.data.lastAnswer).toBe('all done')
        })

        it('does not run the call when the user declines', async () => {
            const agent = new Agent({ loop: loop(), tools: w.tools })
            const asked = await env.send(agent, 'delete 3')

            env.gate.decision = 'DECLINED'
            await env.send(agent, 'no', asked.data._id.toString())

            expect(w.deleted).toEqual([])
        })
    })
})
