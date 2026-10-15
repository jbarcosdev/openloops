export interface UsageTotals {
	input: number
	output: number
	cacheRead: number
	cacheWrite: number
	reasoning: number
	totalTokens: number
	totalCost: number
}

const TOKEN_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens'] as const

const COST_DIGITS = 6

const fromUsage = (path: string) => ({ $ifNull: [`$response.usage.${path}`, 0] })

export const round = (value: number, digits = COST_DIGITS): number => {
	const factor = 10 ** digits
	return Math.round((value + Number.EPSILON) * factor) / factor
}

export const usageSums = (): Record<string, any> => ({
	...Object.fromEntries(TOKEN_FIELDS.map(field => [field, { $sum: fromUsage(field) }])),
	totalCost: { $sum: fromUsage('cost.total') },
})

export const toUsageTotals = (doc?: Partial<UsageTotals>): UsageTotals => ({
	input: doc?.input ?? 0,
	output: doc?.output ?? 0,
	cacheRead: doc?.cacheRead ?? 0,
	cacheWrite: doc?.cacheWrite ?? 0,
	reasoning: doc?.reasoning ?? 0,
	totalTokens: doc?.totalTokens ?? 0,
	totalCost: round(doc?.totalCost ?? 0),
})

export interface UsageSummary extends UsageTotals {
	calls: number
}

export interface ModelUsage extends UsageSummary {
	provider: string
	model: string
}

export interface UsageReport {
	summary: UsageSummary
	models: ModelUsage[]
}

type ModelRow = { _id?: { provider?: string | null, model?: string | null } } & Partial<UsageSummary>

export const usageReportPipeline = (match: Record<string, unknown>): Record<string, any>[] => [
	{ $match: { deletedAt: null, ...match } },
	{ $group: { _id: { provider: '$response.provider', model: '$response.model' }, calls: { $sum: 1 }, ...usageSums() } },
	{ $sort: { totalTokens: -1, '_id.provider': 1, '_id.model': 1 } },
]

export const toUsageReport = (rows: ModelRow[] = []): UsageReport => {
	const models: ModelUsage[] = rows.map(row => ({
		provider: row._id?.provider ?? 'unknown',
		model: row._id?.model ?? 'unknown',
		calls: row.calls ?? 0,
		...toUsageTotals(row),
	}))

	const sum = (field: keyof UsageSummary) => models.reduce((total, item) => total + item[field], 0)

	return {
		models,
		summary: {
			calls: sum('calls'),
			input: sum('input'),
			output: sum('output'),
			cacheRead: sum('cacheRead'),
			cacheWrite: sum('cacheWrite'),
			reasoning: sum('reasoning'),
			totalTokens: sum('totalTokens'),
			totalCost: round(sum('totalCost')),
		},
	}
}
