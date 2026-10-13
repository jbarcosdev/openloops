import { autoInjectable, inject } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { PipelineStage } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { LLMCallRepository } from '../../repositories'
import { UsageTotals, usageSums, toUsageTotals } from '../../usage-totals'

export interface Params extends BaseUseCaseParams {
	filters: {
		sessionId?: string
		messageId?: string
	}
}

export interface Output extends BaseUseCaseOutput {
	data: UsageTotals
}

export const buildUsagePipeline = (params: { ownerId: ObjectId, sessionId?: ObjectId, answerId?: ObjectId }): PipelineStage[] => {
	const { ownerId, sessionId, answerId } = params

	return [
		{
			$match: {
				ownerId,
				deletedAt: null,
				...(sessionId ? { sessionId } : {}),
				...(answerId ? { answerId } : {}),
			},
		},
		{ $group: { _id: null, ...usageSums() } },
	]
}

@autoInjectable()
export class GetLLMUsageUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { filters, currentUser } = params
		const { sessionId, messageId } = filters ?? {}
		const ownerId = currentUser?.userId

		if (!ownerId || (!sessionId && !messageId)) return { data: toUsageTotals() }

		const pipeline = buildUsagePipeline({
			ownerId: new ObjectId(ownerId),
			sessionId: sessionId ? new ObjectId(sessionId) : undefined,
			answerId: messageId ? new ObjectId(messageId) : undefined,
		})

		const [result] = await this.llmCallRepository?._.aggregate(pipeline) as Partial<UsageTotals>[]

		return { data: toUsageTotals(result) }
	}
}
