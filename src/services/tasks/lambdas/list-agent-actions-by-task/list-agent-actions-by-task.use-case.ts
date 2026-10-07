import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { AgentActionRepository } from '../../repositories'
import { AgentActionProps } from '../../entities'

const DEFAULT_LIMIT = 500

export interface Params extends BaseUseCaseParams {
	taskId: string
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgentActionProps[]
}

@autoInjectable()
export class ListAgentActionsByTaskUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentActionRepository) private readonly agentActionRepository?: AgentActionRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { taskId, options, currentUser } = params

		if (!taskId) throw new Error('taskId is required')
		if (!currentUser) this.throwError403()

		const data = await this.agentActionRepository?.findByProps(
			{ ownerId: BaseEntity.toObjectId(currentUser?.userId), taskId: BaseEntity.toObjectId(taskId) },
			{ limit: DEFAULT_LIMIT, sortBy: { _id: 1 }, ...options },
		)

		return { data: data ?? [] }
	}
}
