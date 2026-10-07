import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgentTaskRepository } from '../../repositories'
import { AgentTask, AgentTaskProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: AgentTaskProps
}

export interface Output extends BaseUseCaseOutput {
	data: AgentTaskProps
}

@autoInjectable()
export class UpdateAgentTaskUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentTaskRepository) private readonly agentTaskRepository?: AgentTaskRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!id) {
			throw new Error('Id is required for updating AgentTask')
		}

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating AgentTask')
		}

		const task = AgentTask.fromJSON({ ...payload, _id: id })
		task.setUpdatedBy(currentUser)

		const result = await this.agentTaskRepository?.update(task)

		if (!result) {
			throw new Error('AgentTask not found or update failed')
		}

		return { data: result }
	}
}
