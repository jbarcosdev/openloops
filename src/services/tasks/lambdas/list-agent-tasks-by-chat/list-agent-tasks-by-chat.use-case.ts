import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { AgentTaskRepository } from '../../repositories'
import { AgentTaskProps } from '../../entities'

const DEFAULT_LIMIT = 10

export interface Params extends BaseUseCaseParams {
	chatId: string
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgentTaskProps[]
}

@autoInjectable()
export class ListAgentTasksByChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentTaskRepository) private readonly agentTaskRepository?: AgentTaskRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, options, currentUser } = params

		if (!chatId) throw new Error('chatId is required')
		if (!currentUser) this.throwError403()

		const data = await this.agentTaskRepository?.findByProps(
			{ ownerId: BaseEntity.toObjectId(currentUser?.userId), chatId: BaseEntity.toObjectId(chatId) },
			{ limit: DEFAULT_LIMIT, sortBy: { _id: -1 }, ...options },
		)

		return { data: data ?? [] }
	}
}
