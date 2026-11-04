import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AgentTaskRepository } from '../repositories'
import { AgentTaskProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: AgentTaskProps | null
}

export class GetAgentTaskByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly agentTaskRepository = new AgentTaskRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const data = await this.agentTaskRepository.findById(id, params.scope ?? Scope.canView(currentUser)) ?? null

		return { data }
	}
}
