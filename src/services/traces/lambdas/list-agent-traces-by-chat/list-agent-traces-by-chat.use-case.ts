import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { AgentTraceRepository } from '../../repositories'
import { AgentTraceEntryProps } from '../../entities'

const DEFAULT_LIMIT = 100

export interface Params extends BaseUseCaseParams {
	chatId: string
	taskId?: string
	answerId?: string
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgentTraceEntryProps[]
}

@autoInjectable()
export class ListAgentTracesByChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentTraceRepository) private readonly agentTraceRepository?: AgentTraceRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, taskId, answerId, options, currentUser } = params

		if (!chatId) throw new Error('chatId is required')
		if (!currentUser) this.throwError403()

		const data = await this.agentTraceRepository?.findByProps(
			{
				ownerId: BaseEntity.toObjectId(currentUser?.userId),
				chatId: BaseEntity.toObjectId(chatId),
				...(taskId ? { taskId: BaseEntity.toObjectId(taskId) } : {}),
				...(answerId ? { answerId: BaseEntity.toObjectId(answerId) } : {}),
			},
			{ limit: DEFAULT_LIMIT, sortBy: { _id: 1 }, ...options },
		)

		return { data: data ?? [] }
	}
}
