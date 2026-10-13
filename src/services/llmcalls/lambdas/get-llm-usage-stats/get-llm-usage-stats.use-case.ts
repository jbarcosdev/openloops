import { autoInjectable, inject } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { PipelineStage } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { LLMCallRepository } from '../../repositories'
import { UsageTotals, round, usageSums, toUsageTotals } from '../../usage-totals'
import { PERIODS, UsagePeriod, addDays, enumeratePeriods, resolveRange, resolveTimezone } from './usage-periods'

export interface Params extends BaseUseCaseParams {
	filters?: {
		fromDate?: string
		toDate?: string
		provider?: string
		model?: string
		groupBy?: UsagePeriod
	}
}

export interface ModelUsage {
	provider: string
	model: string
	calls: number
	totalTokens: number
	totalCost: number
	tokensPercentage: number
	costPercentage: number
}

export interface PeriodUsage extends UsageTotals {
	period: string
}

export interface UsageStats {
	summary: {
		calls: number
		totalTokens: number
		totalCost: number
	}
	models: ModelUsage[]
	series: PeriodUsage[]
}

export interface Output extends BaseUseCaseOutput {
	data: UsageStats
}

interface Facets {
	summary: { calls: number, totalTokens: number, totalCost: number }[]
	models: { _id: { provider?: string, model?: string }, calls: number, totalTokens: number, totalCost: number }[]
	series: ({ _id: string } & Partial<UsageTotals>)[]
}

export const buildUsageStatsPipeline = (params: {
	ownerId: ObjectId
	timezone: string
	from: string
	to: string
	groupBy: UsagePeriod
	provider?: string
	model?: string
}): PipelineStage[] => {
	const { ownerId, timezone, from, to, groupBy, provider, model } = params
	const { totalTokens, totalCost } = usageSums()
	const grouped = { calls: { $sum: 1 }, totalTokens, totalCost }

	return [
		{
			$match: {
				ownerId,
				deletedAt: null,
				...(provider ? { 'response.provider': provider } : {}),
				...(model ? { 'response.model': model } : {}),
				$expr: {
					$and: [
						{ $gte: ['$createdAt', { $dateFromString: { dateString: from, timezone } }] },
						{ $lt: ['$createdAt', { $dateFromString: { dateString: addDays(to, 1), timezone } }] },
					],
				},
			},
		},
		{
			$facet: {
				summary: [{ $group: { _id: null, ...grouped } }],
				models: [
					{ $group: { _id: { provider: '$response.provider', model: '$response.model' }, ...grouped } },
					{ $sort: { totalTokens: -1 } },
				],
				series: [
					{ $group: { _id: { $dateToString: { format: PERIODS[groupBy].format, date: '$createdAt', timezone } }, ...usageSums() } },
					{ $sort: { _id: 1 } },
				],
			},
		},
	]
}

const percentage = (part: number, total: number): number => total ? round(part / total * 100, 2) : 0

export const shapeUsageStats = (facets: Partial<Facets> | undefined, periods: string[]): UsageStats => {
	const [found] = facets?.summary ?? []
	const summary = {
		calls: found?.calls ?? 0,
		totalTokens: found?.totalTokens ?? 0,
		totalCost: round(found?.totalCost ?? 0),
	}

	const models = (facets?.models ?? []).map(item => ({
		provider: item._id?.provider ?? 'unknown',
		model: item._id?.model ?? 'unknown',
		calls: item.calls,
		totalTokens: item.totalTokens,
		totalCost: round(item.totalCost),
		tokensPercentage: percentage(item.totalTokens, summary.totalTokens),
		costPercentage: percentage(item.totalCost, summary.totalCost),
	}))

	const byPeriod = new Map((facets?.series ?? []).map(item => [item._id, item]))
	const series = periods.map(period => ({ period, ...toUsageTotals(byPeriod.get(period)) }))

	return { summary, models, series }
}

@autoInjectable()
export class GetLLMUsageStatsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { filters, currentUser } = params
		const { fromDate, toDate, provider, model, groupBy = 'day' } = filters ?? {}
		const ownerId = currentUser?.userId

		if (!ownerId) throw new Error('CurrentUser is required to get the usage stats')

		const timezone = resolveTimezone(currentUser?.preferences?.timezone?.ianaIdentifier)
		const { from, to } = resolveRange({ fromDate, toDate }, timezone)
		const periods = enumeratePeriods(groupBy, from, to)

		const pipeline = buildUsageStatsPipeline({ ownerId: new ObjectId(ownerId), timezone, from, to, groupBy, provider, model })
		const [facets] = await this.llmCallRepository?._.aggregate(pipeline) as Partial<Facets>[]

		return { data: shapeUsageStats(facets, periods) }
	}
}
