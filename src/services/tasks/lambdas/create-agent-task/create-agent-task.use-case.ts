import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgentTaskRepository } from '../../repositories'
import { AgentTask, AgentTaskProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	payload?: AgentTaskProps
}

export interface Output extends BaseUseCaseOutput {
	data: AgentTaskProps | null | undefined
}

@autoInjectable()
export class CreateAgentTaskUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentTaskRepository) private readonly agentTaskRepository?: AgentTaskRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!payload?.chatId) throw new Error('chatId is required to create a task')

		const task = AgentTask.fromJSON({ ...payload })
		task.setCreatedBy(currentUser)
		task.setOwner(currentUser)

		const result = await this.agentTaskRepository?.create(task)

		return { data: result?.toJSON() }
	}
}
