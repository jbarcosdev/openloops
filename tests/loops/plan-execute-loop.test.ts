import { Agent } from '@harness/index'
import { AgentStatus } from '@harness/agent-state'
import { PlanExecuteLoop } from '@loops/plan-execute/loop'
import { actionPlanner, finalResponder, stateObserver, strategyEngine } from '@loops/plan-execute/skills'
import { useHarness, warehouseTools, makeTool } from '../support'

type Step = { step_id: number; tool_name: string; arguments: Record<string, any>; rationale: string; depends_on_steps: number[] }

const step = (id: number, tool: string, args: Record<string, any>, dependsOn: number[] = []): Step => ({ step_id: id, tool_name: tool, arguments: args, rationale: 'r', depends_on_steps: dependsOn })
const plan = (steps: Step[], extra: Record<string, any> = {}) => ({ plan_status: 'SUCCESS', steps, reasoning: 'r', ...extra })
const strategy = (extra: Record<string, any> = {}) => ({ goal: 'the goal', hypothesis: 'the hypothesis', required_capabilities: ['warehouse'], tool_names: ['t_search', 't_get', 't_delete'], detected_language: 'en', reasoning: 'r', is_continuation: false, ...extra })
const observe = (action: string, extra: Record<string, any> = {}) => ({ action, feedback_for_planner: '', user_prompt: '', detected_language: 'en', reasoning: 'observed', ...extra })
const final = (text: string, reasoning = 'summary') => ({ final_response: text, reasoning })

describe('PlanExecuteLoop', () => {
    const env = useHarness()
    let w: ReturnType<typeof warehouseTools>
    let spies: jest.SpyInstance[]
    let timers: jest.SpyInstance

    const calls = { strategy: [] as any[], planner: [] as any[], observer: [] as any[], final: [] as any[] }

    function script (skill: any, bucket: any[], ...results: any[]) {
        const queue = [...results]
        spies.push(jest.spyOn(skill, 'run').mockImplementation(async (options: any) => {
            bucket.push(options)
            return queue.length > 1 ? queue.shift() : queue[0]
        }))
    }

    const strategyEngineScript = (...results: any[]) => script(strategyEngine, calls.strategy, ...results)
    const plannerScript = (...results: any[]) => script(actionPlanner, calls.planner, ...results)
    const observerScript = (...results: any[]) => script(stateObserver, calls.observer, ...results)
    const finalScript = (...results: any[]) => script(finalResponder, calls.final, ...results)

    const agent = (tools = w.tools, maxIterations?: number) => new Agent({ loop: new PlanExecuteLoop(), tools, ...(maxIterations ? { maxIterations } : {}) })
    const lastReply = (result: any) => result.data.messages.at(-1).content
    const executed = (name: string) => env.actions().filter(action => action.name === name && action.status === 'completed')

    beforeEach(() => {
        w = warehouseTools()
        spies = []
        calls.strategy = []
        calls.planner = []
        calls.observer = []
        calls.final = []
        timers = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
            if (ms === 500 || ms === 1000) {
                fn()
                return 0 as any
            }
            return (jest.requireActual('timers').setTimeout as any)(fn, ms, ...args)
        }) as any)
    })

    afterEach(() => {
        spies.forEach(spy => spy.mockRestore())
        timers.mockRestore()
    })

    it('registers the nodes it needs and none for confirmations, which the harness handles', () => {
        expect(Object.keys(new PlanExecuteLoop().nodes)).toEqual(['fast_responder', 'strategy_engine', 'action_planner', 'execution_loop', 'state_observer', 'final_responder'])
    })

    describe('the fast path', () => {
        it('answers without creating a task or calling the planning skills', async () => {
            env.fast.canAnswer = true
            strategyEngineScript(strategy())

            const result = await env.send(agent(), 'hola')

            expect(lastReply(result)).toBe('fast answer')
            expect(calls.strategy).toHaveLength(0)
            expect(env.tasks()).toHaveLength(0)
            expect(result.data.state.status).toBe(AgentStatus.IDLE)
        })
    })

    describe('a complete flow', () => {
        let result: any

        beforeEach(async () => {
            strategyEngineScript(strategy({ goal: 'get item 3', tool_names: ['t_search', 't_get'] }))
            plannerScript(plan([step(1, 't_search', { q: 'warehouse' }), step(2, 't_get', { id: 'id3' }, [1])]))
            observerScript(observe('CONTINUE'))
            finalScript(final('Item 3 found.', 'done'))
            result = await env.send(agent(), 'find item 3')
        })

        it('runs the steps in order and ends idle with the final answer', () => {
            expect(w.gets).toEqual(['id3'])
            expect(lastReply(result)).toBe('Item 3 found.')
            expect(result.data.state.status).toBe(AgentStatus.IDLE)
        })

        it('completes the task with the reasoning of the final responder as summary', () => {
            const [task] = env.tasks()

            expect(env.tasks()).toHaveLength(1)
            expect(task.goal).toBe('get item 3')
            expect(task.status).toBe('completed')
            expect(task.summary).toBe('done')
        })

        it('observes after each step and answers once', () => {
            expect(calls.observer).toHaveLength(2)
            expect(calls.final).toHaveLength(1)
            expect(calls.final[0].contextInjection.execution_results).toHaveLength(2)
            expect(calls.final[0].contextInjection.stop_reason).toBeUndefined()
        })

        it('gives the planner only the tools the strategy selected', () => {
            expect(calls.planner).toHaveLength(1)
            expect(calls.planner[0].contextInjection.tools.map((tool: any) => tool.name)).toEqual(['t_search', 't_get'])
            expect(calls.planner[0].contextInjection.active_task).toMatchObject({ user_goal: 'get item 3', strategy: 'the hypothesis' })
        })
    })

    describe('observing a step', () => {
        it('skips the remaining steps when the observer says the goal is reached', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_search', { q: 'a' }), step(2, 't_get', { id: 'id1' }, [1])]))
            observerScript(observe('FINISH'))
            finalScript(final('Done.'))

            await env.send(agent(), 'go')

            expect(w.gets).toEqual([])
            expect(calls.final).toHaveLength(1)
            expect(env.actions().find(action => action.name === 't_get')!.status).toBe('skipped')
        })

        it('asks the user when the observer needs input', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_search', { q: 'a' })]))
            observerScript(observe('ASK_USER', { user_prompt: 'Which warehouse?' }))
            finalScript(final('unused'))

            const result = await env.send(agent(), 'go')

            expect(lastReply(result)).toBe('Which warehouse?')
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(calls.final).toHaveLength(0)
        })

        it('tells the observer how many replans are left', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_search', { q: 'a' })]))
            observerScript(observe('FINISH'))
            finalScript(final('ok'))

            await env.send(agent(), 'go')

            expect(calls.observer[0].contextInjection).toMatchObject({ user_intent: 'the goal', replans_remaining: 3 })
            expect(calls.observer[0].contextInjection.executed_step).toMatchObject({ tool: 't_search' })
        })
    })

    describe('replanning', () => {
        it('plans again with the feedback and the execution history', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_search', { q: 'first' })]), plan([step(1, 't_get', { id: 'id7' })]))
            observerScript(observe('REPLAN', { feedback_for_planner: 'search other words' }), observe('FINISH'))
            finalScript(final('Found.'))

            await env.send(agent(), 'go')

            expect(calls.planner).toHaveLength(2)
            expect(calls.planner[1].contextInjection).toMatchObject({ replan_feedback: 'search other words', replan_attempt: 1 })
            expect(calls.planner[1].contextInjection.execution_history).toHaveLength(1)
            expect(w.gets).toEqual(['id7'])
        })

        it('does not send replan feedback on the first plan', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_search', { q: 'a' })]))
            observerScript(observe('FINISH'))
            finalScript(final('ok'))

            await env.send(agent(), 'go')

            expect(calls.planner[0].contextInjection.replan_feedback).toBeUndefined()
            expect(calls.planner[0].contextInjection.execution_history).toBeUndefined()
        })

        it('stops with a reason and fails the task when the replan budget is exhausted', async () => {
            strategyEngineScript(strategy())
            plannerScript(
                plan([step(1, 't_search', { q: 'a' })]),
                plan([step(1, 't_search', { q: 'b' })]),
                plan([step(1, 't_search', { q: 'c' })]),
                plan([step(1, 't_search', { q: 'd' })]),
            )
            observerScript(observe('REPLAN', { feedback_for_planner: 'again' }))
            finalScript(final('I could not finish.', 'blocked'))

            const result = await env.send(agent(), 'go')

            expect(calls.planner).toHaveLength(4)
            expect(calls.final[0].contextInjection.stop_reason).toMatch(/replan budget is exhausted/)
            expect(env.task().status).toBe('failed')
            expect(lastReply(result)).toBe('I could not finish.')
        })

        it('stops when the planner only proposes what was already executed', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_search', { q: 'a' })]), plan([step(1, 't_search', { q: 'a' })]))
            observerScript(observe('REPLAN', { feedback_for_planner: 'again' }))
            finalScript(final('Nothing new to try.'))

            await env.send(agent(), 'go')

            expect(executed('t_search')).toHaveLength(1)
            expect(calls.final[0].contextInjection.stop_reason).toMatch(/identical to ones already executed/)
            expect(env.task().status).toBe('failed')
        })
    })

    describe('failing steps', () => {
        function flaky (failures: number) {
            const state = { attempts: 0 }
            const tool = makeTool({
                name: 't_flaky',
                required: ['id'],
                properties: { id: { type: 'string' } },
                handler: async () => {
                    state.attempts++
                    if (state.attempts <= failures) throw new Error('temporary')
                    return { ok: true }
                },
            })

            return { state, tool }
        }

        it('retries a failed step and goes on when it recovers', async () => {
            const { state, tool } = flaky(1)
            strategyEngineScript(strategy({ tool_names: ['t_flaky'] }))
            plannerScript(plan([step(1, 't_flaky', { id: '1' })]))
            observerScript(observe('FINISH'))
            finalScript(final('ok'))

            await env.send(agent([tool]), 'go')

            expect(state.attempts).toBe(2)
            expect(calls.observer).toHaveLength(1)
            expect(calls.observer[0].contextInjection.executed_step.status).toBe('completed')
        })

        it('gives up after two retries and lets the observer see the failure', async () => {
            const { state, tool } = flaky(10)
            strategyEngineScript(strategy({ tool_names: ['t_flaky'] }))
            plannerScript(plan([step(1, 't_flaky', { id: '1' })]))
            observerScript(observe('ASK_USER', { user_prompt: 'It keeps failing' }))
            finalScript(final('unused'))

            await env.send(agent([tool]), 'go')

            expect(state.attempts).toBe(3)
            expect(calls.observer).toHaveLength(1)
            expect(calls.observer[0].contextInjection.executed_step.status).toBe('failed')
        })
    })

    describe('limits', () => {
        it('reaches the iteration limit of the agent before the action limit with the default settings', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan(Array.from({ length: 30 }, (_, i) => step(i + 1, 't_get', { id: `id${i}` }))))
            observerScript(observe('CONTINUE'))
            finalScript(final('Partial.'))

            const result = await env.send(agent(), 'go')

            expect(w.gets.length).toBeLessThan(25)
            expect(calls.final).toHaveLength(0)
            expect(result.data.state.status).toBe(AgentStatus.FAILED)
            expect(result.data.state.lastError.message).toMatch(/limit of 50 iterations/)
            expect(env.task().status).toBe('failed')
        })

        it('stops after 25 executed actions in one task', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan(Array.from({ length: 30 }, (_, i) => step(i + 1, 't_get', { id: `id${i}` }))))
            observerScript(observe('CONTINUE'))
            finalScript(final('Partial.'))

            await env.send(agent(w.tools, 200), 'go')

            expect(w.gets).toHaveLength(25)
            expect(calls.final[0].contextInjection.stop_reason).toMatch(/maximum of 25 executed actions/)
            expect(env.task().status).toBe('failed')
        })
    })

    describe('what the planner can answer instead of a plan', () => {
        it('explains the missing tools, fails the task and waits for the user', async () => {
            strategyEngineScript(strategy({ tool_names: [] }))
            plannerScript({ plan_status: 'MISSING_TOOLS', steps: [], user_response: 'No integration can do that.' })
            finalScript(final('unused'))

            const result = await env.send(agent(), 'go')

            expect(lastReply(result)).toBe('No integration can do that.')
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(env.task().status).toBe('failed')
            expect(calls.final).toHaveLength(0)
        })

        it('asks for what is missing and keeps the task open', async () => {
            strategyEngineScript(strategy())
            plannerScript({ plan_status: 'NEEDS_CLARIFICATION', steps: [], clarification_prompt: 'Which item?' })

            const result = await env.send(agent(), 'get it')

            expect(lastReply(result)).toBe('Which item?')
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(env.task().status).not.toBe('failed')
        })
    })

    describe('continuing a completed task', () => {
        it('reopens it instead of creating another one', async () => {
            strategyEngineScript(strategy({ goal: 'find item' }), strategy({ is_continuation: true }))
            plannerScript(plan([step(1, 't_search', { q: 'a' })]), plan([step(1, 't_get', { id: 'id2' })]))
            observerScript(observe('FINISH'))
            finalScript(final('first'), final('second'))

            const first = await env.send(agent(), 'find item')
            await env.send(agent(), 'now get id2', first.data._id.toString())

            expect(env.tasks()).toHaveLength(1)
            expect(calls.strategy[1].contextInjection.last_completed_task).toMatchObject({ goal: 'find item' })
            expect(w.gets).toEqual(['id2'])
        })
    })

    describe('destructive steps', () => {
        it('sends a plan that skipped the confirmation back to the planner', async () => {
            strategyEngineScript(strategy())
            plannerScript(plan([step(1, 't_delete', { id: '9' })]), plan([step(1, 't_delete', { id: '9' })], { plan_status: 'NEEDS_CONFIRMATION' }))

            const result = await env.send(agent(), 'delete 9')

            expect(calls.planner).toHaveLength(2)
            expect(calls.planner[1].contextInjection.replan_feedback).toMatch(/destructive tool and has not been confirmed/)
            expect(w.deleted).toEqual([])
            expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
        })

        describe('when the planner asks for confirmation', () => {
            let chatId: string
            let agentInstance: Agent

            beforeEach(async () => {
                env.approval.question = 'Delete item 9?'
                strategyEngineScript(strategy())
                plannerScript(plan([step(1, 't_get', { id: '1' }), step(2, 't_delete', { id: '9' })], { plan_status: 'NEEDS_CONFIRMATION' }))
                observerScript(observe('CONTINUE'))
                finalScript(final('All done.'))

                agentInstance = agent()
                const result = await env.send(agentInstance, 'get 1 and delete 9')
                chatId = result.data._id.toString()
            })

            it('stops before running anything and asks with the approval skill', () => {
                const chat = env.db.chats.findById(chatId)!

                expect(w.gets).toEqual([])
                expect(w.deleted).toEqual([])
                expect(chat.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
                expect(chat.messages.at(-1).content).toBe('Delete item 9?')
            })

            it('asks only about the destructive step and resumes at the execution node', () => {
                expect(env.approval.calls).toHaveLength(1)
                expect(env.approval.calls[0].input.pending_actions).toHaveLength(1)
                expect(env.approval.calls[0].input.pending_actions[0]).toMatchObject({ tool: 't_delete' })
                expect(env.task().nextNode).toBe('execution_loop')
            })

            it('runs the whole plan once the user confirms', async () => {
                env.gate.decision = 'CONFIRMED'
                const result = await env.send(agentInstance, 'yes', chatId)

                expect(w.gets).toEqual(['1'])
                expect(w.deleted).toEqual(['9'])
                expect(lastReply(result)).toBe('All done.')
                expect(env.task().status).toBe('completed')
                expect(calls.planner).toHaveLength(1)
            })

            it('cancels the task and runs nothing when the user declines', async () => {
                env.gate.decision = 'DECLINED'
                const result = await env.send(agentInstance, 'no', chatId)

                expect(w.gets).toEqual([])
                expect(w.deleted).toEqual([])
                expect(lastReply(result)).toBe('cancelled ok')
                expect(result.data.state.status).toBe(AgentStatus.IDLE)
                expect(env.task().status).toBe('cancelled')
            })

            it('keeps waiting when the answer is unclear', async () => {
                env.gate.decision = 'UNCLEAR'
                const result = await env.send(agentInstance, 'maybe', chatId)

                expect(w.deleted).toEqual([])
                expect(lastReply(result)).toBe('sure?')
                expect(result.data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            })
        })
    })
})
