import { AgentStatus } from '@harness/agent-state'
import { ListChatsByUserUseCase } from '@services/chats/lambdas/list-chats-by-user'
import { useHarness, warehouseTools, act, say, REAL_ID } from '../support'

describe('autonomous mode', () => {
    const env = useHarness()
    const llm = env.llm
    const autonomous = { executionMode: 'autonomous' as const }

    const ask = (question: string) => ({ actions: [act('ask_user', { question })] })

    describe('the mode of the chat', () => {
        it('is interactive when the run does not say otherwise', async () => {
            llm.script(say('hi'))
            const { data } = await env.send(env.agent(), 'hello')

            expect(data.settings.executionMode).toBe('interactive')
            expect(llm.opening(0).CONTEXT.execution_mode).toBeUndefined()
        })

        it('is recorded when the chat is created and the model is told about it', async () => {
            llm.script(say('done'))
            const { data } = await env.send(env.agent(), 'run the report', undefined, autonomous)

            expect(data.settings.executionMode).toBe('autonomous')
            expect(llm.opening(0).CONTEXT.execution_mode).toBe('autonomous')
        })

        it('keeps the origin of the chat when the user continues it interactively', async () => {
            llm.script(say('done'), say('sure'))
            const first = await env.send(env.agent(), 'run the report', undefined, autonomous)
            const second = await env.send(env.agent(), 'thanks', first.data._id.toString())

            expect(second.data.settings.executionMode).toBe('autonomous')
            expect(llm.opening(1)?.CONTEXT?.execution_mode).toBeUndefined()
        })
    })

    describe('questions of the model', () => {
        it('pauses for the user in interactive mode and never calls the evaluator', async () => {
            llm.script(ask('Which color?'))
            const { data } = await env.send(env.agent(), 'paint it')

            expect(data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(data.lastAnswer).toBe('Which color?')
            expect(env.autonomy.calls).toHaveLength(0)
        })

        it('answers on behalf of the user and tells the model that the answer is automatic', async () => {
            llm.script(ask('Which color?'), say('Painted it blue.'))
            const { data } = await env.send(env.agent(), 'paint it using the color from the brief', undefined, autonomous)

            expect(data.state.status).toBe(AgentStatus.IDLE)
            expect(data.lastAnswer).toBe('Painted it blue.')
            expect(env.autonomy.calls).toHaveLength(1)
            expect(env.autonomy.calls[0].input).toMatchObject({ question: 'Which color?', task_message: 'paint it using the color from the brief' })

            const [observation] = llm.observations(1)
            expect(observation.output).toMatchObject({ answer: 'the blue one', answered_by: 'automatic' })
            expect(observation.output.note).toMatch(/not available/)
        })

        it('does not store the automatic answer as something the user said', async () => {
            llm.script(ask('Which color?'), say('ok'))
            await env.send(env.agent(), 'paint it', undefined, autonomous)

            expect(Object.keys(env.task().known ?? {}).some(key => key.startsWith('user_answer_'))).toBe(false)
        })

        it('pauses for the user when the evaluator cannot decide', async () => {
            env.autonomy.decision = 'CANNOT_DETERMINE'
            llm.script(ask('Which color?'))
            const { data } = await env.send(env.agent(), 'paint it', undefined, autonomous)

            expect(data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(data.lastAnswer).toBe('Which color?')
        })

        it('pauses for the user when the evaluator fails', async () => {
            env.autonomy.fails = true
            llm.script(ask('Which color?'))
            const { data } = await env.send(env.agent(), 'paint it', undefined, autonomous)

            expect(data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
        })

        it('answers at most three questions of a task and then waits for the user', async () => {
            llm.script(ask('q1'), ask('q2'), ask('q3'), ask('q4'))
            const { data } = await env.send(env.agent(), 'do it', undefined, autonomous)

            expect(env.autonomy.calls).toHaveLength(3)
            expect(data.state.status).toBe(AgentStatus.AWAITING_USER_INPUT)
            expect(data.lastAnswer).toBe('q4')
        })

        it('does not let an identifier invented by the evaluator ground an action', async () => {
            const w = warehouseTools()
            env.autonomy.answer = `use item ${REAL_ID}`
            llm.script(ask('Which item?'), { actions: [act('t_get', { id: REAL_ID })] }, say('could not'))
            await env.send(env.agent(w.tools), 'get the item', undefined, autonomous)

            expect(w.gets).toEqual([])
            const get = env.actions().find(action => action.name === 't_get')
            expect(get?.status).toBe('failed')
            expect(String(get?.error?.message)).toMatch(/invented|not found in the user's messages/)
        })
    })

    describe('actions that need approval', () => {
        it('pauses the run and leaves the question for the user in the chat', async () => {
            const w = warehouseTools()
            env.approval.question = 'Do you want me to delete item 9?'
            llm.script({ actions: [act('t_delete', { id: '9' })] }, say('Item 9 deleted.'))
            const { data } = await env.send(env.agent(w.tools), 'delete 9', undefined, autonomous)

            expect(w.deleted).toEqual([])
            expect(data.state.status).toBe(AgentStatus.AWAITING_USER_CONFIRMATION)
            expect(data.lastAnswer).toBe('Do you want me to delete item 9?')
            expect(env.traces().some(entry => entry.node === 'autonomous_mode')).toBe(true)
        })

        it('resumes when the user answers in the chat, interactively', async () => {
            const w = warehouseTools()
            llm.script({ actions: [act('t_delete', { id: '9' })] }, say('Item 9 deleted.'))
            const first = await env.send(env.agent(w.tools), 'delete 9', undefined, autonomous)
            const second = await env.send(env.agent(w.tools), 'yes, delete it', first.data._id.toString())

            expect(w.deleted).toEqual(['9'])
            expect(second.data.state.status).toBe(AgentStatus.IDLE)
            expect(second.data.settings.executionMode).toBe('autonomous')
        })
    })

    describe('listing the chats of a user', () => {
        const list = async (executionMode?: 'interactive' | 'autonomous') => {
            const findMany = jest.fn(async () => [])
            await new ListChatsByUserUseCase({ _: { findMany } } as any).execute({ executionMode, currentUser: env.user })
            return (findMany.mock.calls[0] as any[])[0].where
        }

        it('does not filter by mode when none is given', async () => {
            expect(Object.keys(await list())).toEqual(['ownerId'])
        })

        it('keeps only the autonomous chats', async () => {
            expect((await list('autonomous'))['settings.executionMode']).toBe('autonomous')
        })

        it('keeps the interactive chats and the ones saved before the mode existed', async () => {
            expect((await list('interactive'))['settings.executionMode']).toEqual({ $ne: 'autonomous' })
        })
    })
})
