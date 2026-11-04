import { QueryOptions, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { AgentActionRepository } from '../repositories'
import { AgentActionProps } from '../entities'

const DEFAULT_LIMIT = 500

export interface Params extends BaseUseCaseParams {
	taskId: string
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgentActionProps[]
	hasMore?: boolean
}

export class ListAgentActionsByTaskUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly agentActionRepository = new AgentActionRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { taskId, options, currentUser } = params

		if (!taskId) throw new Error('taskId is required')
		if (!currentUser) this.throwError403()

		const result = await this.agentActionRepository.findByProps(
			{ ownerId: BaseEntity.toObjectId(currentUser?.userId), taskId: BaseEntity.toObjectId(taskId) },
			{ limit: DEFAULT_LIMIT, sortBy: { _id: 1 }, ...options },
			params.scope ?? Scope.canView(currentUser),
		)

		return { data: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
