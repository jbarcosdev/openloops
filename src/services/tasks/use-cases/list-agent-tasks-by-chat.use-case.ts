import { QueryOptions, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { AgentTaskRepository } from '../repositories'
import { AgentTaskProps } from '../entities'

const DEFAULT_LIMIT = 10

export interface Params extends BaseUseCaseParams {
	chatId: string
	options?: QueryOptions
}

export interface Output {
	items: AgentTaskProps[]
	hasMore: boolean
}

export class ListAgentTasksByChatUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly agentTaskRepository = new AgentTaskRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, options, currentUser } = params

		if (!chatId) throw new Error('chatId is required')
		if (!currentUser) this.throwError403()

		const result = await this.agentTaskRepository.findByProps(
			{ ownerId: BaseEntity.toObjectId(currentUser?.userId), chatId: BaseEntity.toObjectId(chatId) },
			{ limit: DEFAULT_LIMIT, sortBy: { _id: -1 }, ...options },
			params.scope ?? Scope.canView(currentUser),
		)

		return { items: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
