import { ObjectId } from 'mongodb'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCallRepository } from '../repositories'
import { UsageReport, usageReportPipeline, toUsageReport } from '../utils/usage-totals'

export interface Params extends BaseUseCaseParams {
	messageId: string
}

export type Output = UsageReport

export class GetLLMUsageByMessageUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository = new LLMCallRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { messageId, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to get the usage of a message')
		if (!messageId || !ObjectId.isValid(messageId)) throw new Error('messageId is required and must be a valid id')

		const rows = await this.llmCallRepository._.aggregate(usageReportPipeline({
			ownerId: new ObjectId(currentUser.userId),
			answerId: new ObjectId(messageId),
		}) as any[], params.scope ?? Scope.canView(currentUser))

		return toUsageReport(rows as any[])
	}
}
