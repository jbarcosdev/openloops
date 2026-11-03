import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AgentActionRepository } from '../repositories'
import { AgentAction, AgentActionProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: AgentActionProps
}

export interface Output extends BaseUseCaseOutput {
	data: AgentActionProps
}

@autoInjectable()
export class UpdateAgentActionUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentActionRepository) private readonly agentActionRepository?: AgentActionRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!id) {
			throw new Error('Id is required for updating AgentAction')
		}

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating AgentAction')
		}

		const action = AgentAction.fromJSON({ ...payload, _id: id })

		const result = await this.agentActionRepository?.update(action, params.scope ?? Scope.canEdit(currentUser))

		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
