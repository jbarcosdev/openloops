import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AgentTaskRepository } from '../repositories'
import { AgentTask, AgentTaskProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	payload?: AgentTaskProps
}

export type Output = AgentTaskProps

export class CreateAgentTaskUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly agentTaskRepository = new AgentTaskRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!payload?.chatId) throw new Error('chatId is required to create a task')

		const task = AgentTask.fromJSON({ ...payload })

		const result = await this.agentTaskRepository.create(task, params.scope ?? Scope.canEdit(currentUser))

		return result.toJSON()
	}
}
