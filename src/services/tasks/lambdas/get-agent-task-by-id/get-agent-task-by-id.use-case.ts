import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgentTaskRepository } from '../../repositories'
import { AgentTaskProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: AgentTaskProps | null
}

@autoInjectable()
export class GetAgentTaskByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentTaskRepository) private readonly agentTaskRepository?: AgentTaskRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id } = params
		const data = await this.agentTaskRepository?.findById(id) ?? null

		return { data }
	}
}
