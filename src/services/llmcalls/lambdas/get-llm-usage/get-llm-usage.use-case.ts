import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { LLMCallRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	filters: {
		sessionId?: string
		messageId?: string
		fromDate?: string
		toDate?: string
	}
}

export interface Output extends BaseUseCaseOutput {
	data: {
		totalTokens?: number
		tokensLimit?: number
	}
}

@autoInjectable()
export class GetLLMUsageUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { filters, currentUser } = params
		const { sessionId, messageId, fromDate, toDate } = filters
		const ownerId = currentUser?.userId

		if (!ownerId) {
			return { data: {} }
		}

		const userTimezoneOffset = currentUser?.timezoneOffset
		const now = new Date()
		const defaultFromDate = new Date(now.getFullYear(), now.getMonth(), 1)
		const defaultToDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

		const effectiveFromDate = fromDate || defaultFromDate
		const effectiveToDate = toDate || defaultToDate

		const pipeline = [
			{
				$match: {
					ownerId: this.llmCallRepository?._.parseId(ownerId),
					...(sessionId ? { sessionId: this.llmCallRepository?._.parseId(sessionId) } : {}),
					...(messageId ? { answerId: this.llmCallRepository?._.parseId(messageId) } : {}),
				}
			},
			{
				$addFields: {
					fromDateUTC: {
						$cond: {
							if: { $and: [effectiveFromDate, { $ne: [effectiveFromDate, null] }] },
							then: {
								$dateSubtract: {
									startDate: new Date(effectiveFromDate),
									unit: "minute",
									amount: userTimezoneOffset || 0
								}
							},
							else: null
						}
					},
					toDateUTC: {
						$cond: {
							if: { $and: [effectiveToDate, { $ne: [effectiveToDate, null] }] },
							then: {
								$dateSubtract: {
									startDate: new Date(effectiveToDate),
									unit: "minute",
									amount: userTimezoneOffset || 0
								}
							},
							else: null
						}
					}
				}
			},
			{
				$match: {
					$expr: {
						$and: [
							{ $gte: ["$createdAt", "$fromDateUTC"] },
							{ $lte: ["$createdAt", "$toDateUTC"] }
						]
					}
				}
			},
			{
				$group: {
					_id: "$ownerId",
					totalTokens: { $sum: "$response.usage.totalTokens" }
				}
			}
		]

		const result = await this.llmCallRepository?._.aggregate(pipeline) as any


		return {
			data: {
				...result[0],
			}
		}
	}
}
