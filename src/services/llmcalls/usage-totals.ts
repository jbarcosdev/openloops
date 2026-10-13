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
