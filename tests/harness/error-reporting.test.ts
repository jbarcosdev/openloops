import { Agent, AgentStatus } from '@harness/index'
import { LLMError } from '@clients/llm/llm-error'
import { setErrorReporter } from '@common/index'
import { Guard } from '@guardrails/index'
import { useHarness, makeLoop } from '../support'

describe('Agent and the error reporter', () => {
    const env = useHarness()
    const reporter = jest.fn()

    beforeEach(() => {
        reporter.mockReset()
        setErrorReporter(reporter)
    })

    afterEach(() => setErrorReporter(undefined))

    it('reports a failed run with the chat, the user and the code of the model error', async () => {
        env.llm.script({ throws: LLMError.fromProvider('429 rate limit exceeded') })

        const result = await env.send(env.agent(), 'hola')

        expect(result.error).toBeDefined()
        expect(reporter).toHaveBeenCalledTimes(1)
        expect(reporter.mock.calls[0][0]).toBeInstanceOf(LLMError)
        expect(reporter.mock.calls[0][1]).toEqual({ source: 'agent', code: 'LLM_RATE_LIMITED', chatId: result.data._id.toString(), userId: env.user.userId })
    })

    it('reports a failure that is not from the model without a code', async () => {
        env.llm.script({ throws: new Error('something broke') })

        await env.send(env.agent(), 'hola')

        expect(reporter.mock.calls[0][1]).not.toHaveProperty('code')
        expect(reporter.mock.calls[0][1]).toMatchObject({ source: 'agent' })
    })

    it('does not report a run that goes well', async () => {
        env.fast.canAnswer = true

        const result = await env.send(env.agent(), 'hola')

        expect(result.error).toBeUndefined()
        expect(reporter).not.toHaveBeenCalled()
    })

    it('still ends the run as failed when the reporter throws', async () => {
        reporter.mockImplementation(() => { throw new Error('reporter down') })
        env.llm.script({ throws: LLMError.fromProvider('503 service unavailable') })

        const result = await env.send(env.agent(), 'hola')

        expect(result.error).toContain('temporarily unavailable')
        expect(env.db.chats.all()[0].state.status).toBe(AgentStatus.FAILED)
    })

    it('reports a guard that throws, with its name, and still closes the request', async () => {
        const broken = new Guard({ name: 'broken', type: 'input', reply: 'blocked', handler: () => { throw new Error('classifier down') } })

        const result = await env.send(env.agent([], [broken]), 'hola')

        expect(result.data.messages[1].content).toContain('The request could not be processed')
        expect(reporter).toHaveBeenCalledTimes(1)
        expect(reporter.mock.calls[0][0].message).toBe('classifier down')
        expect(reporter.mock.calls[0][1]).toMatchObject({ source: 'agent', stage: 'guard', guard: 'broken' })
    })

    it('reports an activity listener that throws and goes on with the run', async () => {
        const agent = new Agent({ loop: makeLoop({ initialNode: 'work', nodes: { work: async ctx => { ctx.chat.state.setCurrentActivity('Thinking...') } } }) })
        agent.onActivity(() => { throw new Error('listener exploded') })

        const result = await env.send(agent, 'x')

        expect(result.error).toBeUndefined()
        expect(reporter).toHaveBeenCalledTimes(1)
        expect(reporter.mock.calls[0][1]).toMatchObject({ source: 'agent', listener: 'activity' })
    })
})
