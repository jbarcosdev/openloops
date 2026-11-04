import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AgentTaskRepository } from '../repositories'
import { AgentTask, AgentTaskProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: AgentTaskProps
}

export type Output = AgentTaskProps

export class UpdateAgentTaskUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly agentTaskRepository = new AgentTaskRepository()) {
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

		const result = await this.agentTaskRepository.update(task, params.scope ?? Scope.canEdit(currentUser))

		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
