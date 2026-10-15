import 'reflect-metadata'
import { ObjectId } from 'mongodb'
import { GetLLMUsageByMessageUseCase } from '@services/llmcalls/use-cases/get-llm-usage-by-message.use-case'
import { GetLLMUsageByChatUseCase } from '@services/llmcalls/use-cases/get-llm-usage-by-chat.use-case'
import { toUsageReport } from '@services/llmcalls/utils/usage-totals'
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

describe('the usage of a message and of a chat', () => {
    const row = (provider: string | null, model: string | null, values: Record<string, number>) => ({ _id: { provider, model }, calls: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 0, totalCost: 0, ...values })

    const cases = [
        ['message', (fake: any) => new GetLLMUsageByMessageUseCase(fake), 'messageId', 'answerId'],
        ['chat', (fake: any) => new GetLLMUsageByChatUseCase(fake), 'chatId', 'sessionId'],
    ] as const

    describe.each(cases)('by %s', (_label, make, param, field) => {
        it('asks only for the calls of the user that belong to it, grouped by model', async () => {
            const { repository: fake, aggregate } = repository([])
            const id = new ObjectId()

            await make(fake).execute({ [param]: id.toHexString(), currentUser: user() } as any)

            const [match, group, sort] = aggregate.mock.calls[0][0] as any[]
            expect(match.$match).toEqual({ deletedAt: null, ownerId: new ObjectId(OWNER), [field]: id })
            expect(group.$group._id).toEqual({ provider: '$response.provider', model: '$response.model' })
            expect(group.$group.calls).toEqual({ $sum: 1 })
            expect(sort.$sort.totalTokens).toBe(-1)
        })

        it('reads everything from the stored response', async () => {
            const { repository: fake, aggregate } = repository([])

            await make(fake).execute({ [param]: new ObjectId().toHexString(), currentUser: user() } as any)

            const [, group] = aggregate.mock.calls[0][0] as any[]
            expect(group.$group.totalCost).toEqual({ $sum: { $ifNull: ['$response.usage.cost.total', 0] } })
            expect(group.$group.reasoning).toEqual({ $sum: { $ifNull: ['$response.usage.reasoning', 0] } })
            expect(group.$group.cacheWrite).toEqual({ $sum: { $ifNull: ['$response.usage.cacheWrite', 0] } })
            expect(group.$group.input).toEqual({ $sum: { $ifNull: ['$response.usage.input', 0] } })
        })

        it('returns the summary and the detail of each model', async () => {
            const { repository: fake } = repository([
                row('anthropic', 'claude-haiku-5-5', { calls: 3, input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 3, totalTokens: 18, totalCost: 0.0012345678 }),
            ])

            const { data } = await make(fake).execute({ [param]: new ObjectId().toHexString(), currentUser: user() } as any)

            expect(data.models).toEqual([{ provider: 'anthropic', model: 'claude-haiku-5-5', calls: 3, input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 3, totalTokens: 18, totalCost: 0.001235 }])
            expect(data.summary).toEqual({ calls: 3, input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 3, totalTokens: 18, totalCost: 0.001235 })
        })

        it('returns zeros and no models when there are no calls', async () => {
            const { repository: fake } = repository([])

            const { data } = await make(fake).execute({ [param]: new ObjectId().toHexString(), currentUser: user() } as any)

            expect(data.models).toEqual([])
            expect(data.summary).toEqual({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 0, totalCost: 0 })
        })

        it('needs a user and a valid id, and does not query without them', async () => {
            const { repository: fake, aggregate } = repository([])

            await expect(make(fake).execute({ [param]: new ObjectId().toHexString() } as any)).rejects.toThrow(/CurrentUser/)
            await expect(make(fake).execute({ [param]: 'nope', currentUser: user() } as any)).rejects.toThrow(/valid id/)
            await expect(make(fake).execute({ currentUser: user() } as any)).rejects.toThrow(/valid id/)
            expect(aggregate).not.toHaveBeenCalled()
        })
    })

    describe('the report', () => {
        it('adds up the models to make the summary, so both always match', () => {
            const report = toUsageReport([
                row('anthropic', 'claude-haiku-5-5', { calls: 4, input: 100, output: 40, cacheRead: 300, cacheWrite: 50, reasoning: 10, totalTokens: 490, totalCost: 0.0123 }),
                row('openai', 'gpt-4o-mini', { calls: 1, input: 20, output: 5, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 25, totalCost: 0.0004 }),
            ])

            expect(report.models.map(item => `${item.provider}/${item.model}`)).toEqual(['anthropic/claude-haiku-5-5', 'openai/gpt-4o-mini'])
            expect(report.summary).toEqual({ calls: 5, input: 120, output: 45, cacheRead: 300, cacheWrite: 50, reasoning: 10, totalTokens: 515, totalCost: 0.0127 })
        })

        it('keeps a call that has no provider or model, as unknown', () => {
            const report = toUsageReport([row(null, null, { totalTokens: 7 })])

            expect(report.models[0]).toMatchObject({ provider: 'unknown', model: 'unknown', totalTokens: 7 })
        })

        it('does not fail when a call has no usage fields', () => {
            const report = toUsageReport([{ _id: { provider: 'p', model: 'm' }, calls: 2 }])

            expect(report.summary).toMatchObject({ calls: 2, totalTokens: 0, totalCost: 0 })
        })
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
