import { Agent, AgentStatus, AGENT_ERROR_CODES } from '@harness/index'
import { setErrorReporter } from '@common/error'
import { getLLMUsageStats } from '@services/llmcalls'
import { useHarness, makeLoop } from '../support'

const stats = (totalCost: number) => ({ summary: { calls: 1, totalTokens: 10, totalCost }, models: [], series: [] }) as any

describe('Usage limit', () => {
    const env = useHarness()
    const getStats = getLLMUsageStats as jest.Mock
    const limit = { maxCostUsd: 1, period: 'month' as const }

    const idleLoop = () => makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.chat.state.setStatus(AgentStatus.IDLE) } } })

    beforeEach(() => getStats.mockReset().mockResolvedValue(stats(0)))

    it('runs as always when no limit is given', async () => {
        const result = await env.send(new Agent({ loop: idleLoop() }), 'x')

        expect(result.error).toBeUndefined()
        expect(getStats).not.toHaveBeenCalled()
    })

    it('runs when the spend is under the limit and asks for the range of the period', async () => {
        getStats.mockResolvedValue(stats(0.99))
        const agent = new Agent({ loop: idleLoop() })
        const result = await agent.run({ input: { message: 'x' }, currentUser: env.user, usageLimit: { maxCostUsd: 1, period: 'day' } })

        expect(result.error).toBeUndefined()
        const { filters } = getStats.mock.calls[0][0]
        expect(filters.fromDate).toBe(filters.toDate)
    })

    it('blocks before doing anything when the spend reached the limit', async () => {
        getStats.mockResolvedValue(stats(1))
        let ran = false
        const agent = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async () => { ran = true } } }) })
        const result = await agent.run({ input: { message: 'x' }, currentUser: env.user, usageLimit: limit })

        expect(ran).toBe(false)
        expect(result.data).toBeUndefined()
        expect(result.errorCode).toBe(AGENT_ERROR_CODES.USAGE_LIMIT_REACHED)
        expect(result.usageLimit).toEqual({ used: 1, limit: 1, period: 'month' })
        expect(result.error).toContain('month')
        expect(env.db.chats.all()).toHaveLength(0)
    })

    it('does not send a blocked run to the error reporter', async () => {
        getStats.mockResolvedValue(stats(2))
        const reporter = jest.fn()
        setErrorReporter(reporter)
        const result = await new Agent({ loop: idleLoop() }).run({ input: { message: 'x' }, currentUser: env.user, usageLimit: limit })

        expect(result.errorCode).toBe('USAGE_LIMIT_REACHED')
        expect(reporter).not.toHaveBeenCalled()
        setErrorReporter()
    })

    it('rejects a limit that is not valid', async () => {
        const agent = new Agent({ loop: idleLoop() })

        expect((await agent.run({ input: { message: 'x' }, currentUser: env.user, usageLimit: { maxCostUsd: 0, period: 'month' } })).error).toContain('maxCostUsd')
        expect((await agent.run({ input: { message: 'x' }, currentUser: env.user, usageLimit: { maxCostUsd: 1, period: 'year' as any } })).error).toContain('period')
    })

    it('lets the run finish when it passes the limit and stopOnUsageLimit is off', async () => {
        getStats.mockResolvedValueOnce(stats(0)).mockResolvedValue(stats(5))
        let turns = 0
        const agent = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async (ctx, harness) => { turns++; if (turns < 3) harness.setNextNode('a'); else ctx.chat.state.setStatus(AgentStatus.IDLE) } } }) })
        const result = await agent.run({ input: { message: 'x' }, currentUser: env.user, usageLimit: limit })

        expect(turns).toBe(3)
        expect(result.error).toBeUndefined()
        expect(getStats).toHaveBeenCalledTimes(1)
    })

    it('stops between iterations when stopOnUsageLimit is on and the spend passes the limit', async () => {
        getStats.mockResolvedValueOnce(stats(0)).mockResolvedValue(stats(1.5))
        let turns = 0
        const agent = new Agent({ stopOnUsageLimit: true, loop: makeLoop({ initialNode: 'a', nodes: { a: async (_ctx, harness) => { turns++; harness.setNextNode('a') } } }) })
        const result = await agent.run({ input: { message: 'x' }, currentUser: env.user, usageLimit: limit })

        expect(turns).toBe(1)
        expect(result.errorCode).toBe('USAGE_LIMIT_REACHED')
        expect(result.usageLimit).toEqual({ used: 1.5, limit: 1, period: 'month' })
        expect(result.data?.state?.status).toBe(AgentStatus.FAILED)
        expect(result.data?.state?.lastError?.code).toBe('USAGE_LIMIT_REACHED')
        expect(result.data?.state?.lastError?.isRetryable).toBe(false)
    })

    it('ignores stopOnUsageLimit when the run has no limit', async () => {
        let turns = 0
        const agent = new Agent({ stopOnUsageLimit: true, loop: makeLoop({ initialNode: 'a', nodes: { a: async (ctx, harness) => { turns++; if (turns < 3) harness.setNextNode('a'); else ctx.chat.state.setStatus(AgentStatus.IDLE) } } }) })
        const result = await env.send(agent, 'x')

        expect(result.error).toBeUndefined()
        expect(getStats).not.toHaveBeenCalled()
    })
})
