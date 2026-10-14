import 'reflect-metadata'
import { ObjectId } from 'mongodb'
import { GetLLMUsageUseCase, buildUsagePipeline } from '@services/llmcalls/use-cases/get-llm-usage.use-case'
import { GetLLMUsageStatsUseCase, buildUsageStatsPipeline, shapeUsageStats } from '@services/llmcalls/use-cases/get-llm-usage-stats.use-case'
import { MAX_PERIODS, enumeratePeriods, resolveRange, resolveTimezone } from '@services/llmcalls/utils/usage-periods'

const OWNER = new ObjectId().toHexString()

const repository = (result: any[] = []) => {
    const aggregate = jest.fn(async (_pipeline: any[]) => result)
    return { repository: { _: { aggregate } } as any, aggregate }
}

const user = (timezone?: string): any => ({ userId: OWNER, preferences: timezone ? { timezone: { ianaIdentifier: timezone } } : undefined })

describe('usage periods', () => {
    it('lists the days of a range, crossing a month boundary', () => {
        expect(enumeratePeriods('day', '2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
    })

    it('lists the months that a range touches', () => {
        expect(enumeratePeriods('month', '2025-11-20', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    })

    it('accepts a year of days and rejects more', () => {
        expect(enumeratePeriods('day', '2026-01-01', '2026-12-31')).toHaveLength(365)
        expect(enumeratePeriods('day', '2024-01-01', '2024-12-31')).toHaveLength(MAX_PERIODS)
        expect(() => enumeratePeriods('day', '2024-01-01', '2025-01-01')).toThrow(/more than 366 periods/)
    })

    it('rejects a period it does not know', () => {
        expect(() => enumeratePeriods('week' as any, '2026-01-01', '2026-01-31')).toThrow(/Invalid groupBy/)
    })

    it('defaults to the current month in the time zone of the user', () => {
        const now = new Date('2026-10-31T23:30:00Z')

        expect(resolveRange({}, 'America/Lima', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
        expect(resolveRange({}, 'Asia/Tokyo', now)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    })

    it('fills only the missing side of the range', () => {
        const now = new Date('2026-02-10T12:00:00Z')

        expect(resolveRange({ fromDate: '2026-02-05' }, 'UTC', now)).toEqual({ from: '2026-02-05', to: '2026-02-28' })
        expect(resolveRange({ toDate: '2026-02-05' }, 'UTC', now)).toEqual({ from: '2026-02-01', to: '2026-02-05' })
    })

    it('rejects malformed or inverted ranges', () => {
        expect(() => resolveRange({ fromDate: '10/02/2026' }, 'UTC')).toThrow(/YYYY-MM-DD/)
        expect(() => resolveRange({ fromDate: '2026-02-30' }, 'UTC')).toThrow(/YYYY-MM-DD/)
        expect(() => resolveRange({ fromDate: '2026-03-01', toDate: '2026-02-01' }, 'UTC')).toThrow(/later/)
    })

    it('falls back to UTC for a missing or unknown time zone', () => {
        expect(resolveTimezone(undefined)).toBe('UTC')
        expect(resolveTimezone('Mars/Olympus')).toBe('UTC')
        expect(resolveTimezone('America/Lima')).toBe('America/Lima')
    })
})

describe('getLLMUsage', () => {
    it('returns zeros without querying when there is no chat or message', async () => {
        const { repository: fake, aggregate } = repository()

        const { data } = await new GetLLMUsageUseCase(fake).execute({ filters: {}, currentUser: user() })

        expect(data).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 0, totalCost: 0 })
        expect(aggregate).not.toHaveBeenCalled()
    })

    it('filters by chat and message and reads everything from the stored response', () => {
        const ownerId = new ObjectId()
        const sessionId = new ObjectId()
        const answerId = new ObjectId()

        const [match, group] = buildUsagePipeline({ ownerId, sessionId, answerId }) as any[]

        expect(match.$match).toEqual({ ownerId, deletedAt: null, sessionId, answerId })
        expect(group.$group.totalCost).toEqual({ $sum: { $ifNull: ['$response.usage.cost.total', 0] } })
        expect(group.$group.reasoning).toEqual({ $sum: { $ifNull: ['$response.usage.reasoning', 0] } })
        expect(group.$group.cacheWrite).toEqual({ $sum: { $ifNull: ['$response.usage.cacheWrite', 0] } })
    })

    it('returns the totals of the matching calls', async () => {
        const { repository: fake, aggregate } = repository([{ _id: null, input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 3, totalTokens: 18, totalCost: 0.0012345678 }])

        const { data } = await new GetLLMUsageUseCase(fake).execute({ filters: { sessionId: new ObjectId().toHexString() }, currentUser: user() })

        expect(aggregate).toHaveBeenCalledTimes(1)
        expect(data).toEqual({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 3, totalTokens: 18, totalCost: 0.001235 })
    })

    it('returns zeros when nothing matches', async () => {
        const { repository: fake } = repository([])

        const { data } = await new GetLLMUsageUseCase(fake).execute({ filters: { messageId: new ObjectId().toHexString() }, currentUser: user() })

        expect(data.totalTokens).toBe(0)
        expect(data.totalCost).toBe(0)
    })
})

describe('getLLMUsageStats', () => {
    const ownerId = new ObjectId()

    it('builds the pipeline with the owner, the local range and the time zone', () => {
        const [match, facet] = buildUsageStatsPipeline({ ownerId, timezone: 'America/Lima', from: '2026-10-01', to: '2026-10-31', groupBy: 'day', provider: 'openai', model: 'gpt-4o-mini' }) as any[]

        expect(match.$match).toMatchObject({ ownerId, deletedAt: null, 'response.provider': 'openai', 'response.model': 'gpt-4o-mini' })
        expect(match.$match.$expr.$and[0]).toEqual({ $gte: ['$createdAt', { $dateFromString: { dateString: '2026-10-01', timezone: 'America/Lima' } }] })
        expect(match.$match.$expr.$and[1]).toEqual({ $lt: ['$createdAt', { $dateFromString: { dateString: '2026-11-01', timezone: 'America/Lima' } }] })
        expect(facet.$facet.series[0].$group._id).toEqual({ $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Lima' } })
    })

    it('does not filter by provider or model when they are not given', () => {
        const [match] = buildUsageStatsPipeline({ ownerId, timezone: 'UTC', from: '2026-10-01', to: '2026-10-31', groupBy: 'month' }) as any[]

        expect(Object.keys(match.$match)).toEqual(['ownerId', 'deletedAt', '$expr'])
    })

    it('fills the periods without calls with zeros and computes both percentages', () => {
        const stats = shapeUsageStats({
            summary: [{ calls: 3, totalTokens: 1000, totalCost: 0.5 }],
            models: [
                { _id: { provider: 'openai', model: 'a' }, calls: 2, totalTokens: 900, totalCost: 0.1 },
                { _id: { provider: 'google', model: 'b' }, calls: 1, totalTokens: 100, totalCost: 0.4 },
            ],
            series: [{ _id: '2026-10-02', input: 600, output: 400, cacheRead: 0, cacheWrite: 0, reasoning: 50, totalTokens: 1000, totalCost: 0.5 }],
        }, ['2026-10-01', '2026-10-02', '2026-10-03'])

        expect(stats.summary).toEqual({ calls: 3, totalTokens: 1000, totalCost: 0.5 })
        expect(stats.models.map(item => [item.model, item.tokensPercentage, item.costPercentage])).toEqual([['a', 90, 20], ['b', 10, 80]])
        expect(stats.series.map(item => [item.period, item.totalTokens])).toEqual([['2026-10-01', 0], ['2026-10-02', 1000], ['2026-10-03', 0]])
        expect(stats.series[0]).toEqual({ period: '2026-10-01', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 0, totalCost: 0 })
    })

    it('returns zeros and no models when there are no calls', () => {
        const stats = shapeUsageStats({ summary: [], models: [], series: [] }, ['2026-10-01'])

        expect(stats.summary).toEqual({ calls: 0, totalTokens: 0, totalCost: 0 })
        expect(stats.models).toEqual([])
        expect(stats.series).toHaveLength(1)
    })

    it('uses the time zone of the user and groups by day by default', async () => {
        const { repository: fake, aggregate } = repository([{ summary: [], models: [], series: [] }])

        await new GetLLMUsageStatsUseCase(fake).execute({ filters: { fromDate: '2026-10-01', toDate: '2026-10-03' }, currentUser: user('America/Lima') })

        const [match, facet] = aggregate.mock.calls[0][0]
        expect(match.$match.$expr.$and[0].$gte[1].$dateFromString.timezone).toBe('America/Lima')
        expect(facet.$facet.series[0].$group._id.$dateToString.format).toBe('%Y-%m-%d')
    })

    it('requires a user and a valid range before querying', async () => {
        const { repository: fake, aggregate } = repository()
        const useCase = new GetLLMUsageStatsUseCase(fake)

        await expect(useCase.execute({ currentUser: undefined })).rejects.toThrow(/CurrentUser/)
        await expect(useCase.execute({ filters: { fromDate: '2020-01-01', toDate: '2026-01-01' }, currentUser: user() })).rejects.toThrow(/more than 366/)
        expect(aggregate).not.toHaveBeenCalled()
    })
})
