import { autoInjectable, inject } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { LLMCallRepository } from '../repositories'
import { UsageReport, usageReportPipeline, toUsageReport } from '../utils/usage-totals'

export interface Params extends BaseUseCaseParams {
	chatId: string
}

export interface Output extends BaseUseCaseOutput {
	data: UsageReport
}

@autoInjectable()
export class GetLLMUsageByChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to get the usage of a chat')
		if (!chatId || !ObjectId.isValid(chatId)) throw new Error('chatId is required and must be a valid id')

		const rows = await this.llmCallRepository?._.aggregate(usageReportPipeline({
			ownerId: new ObjectId(currentUser.userId),
			sessionId: new ObjectId(chatId),
		}) as any[])

		return { data: toUsageReport(rows as any[]) }
	}
}
