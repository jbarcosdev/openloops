import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AgentActionRepository } from '../repositories'
import { AgentAction, AgentActionProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	payload?: AgentActionProps
}

export interface Output extends BaseUseCaseOutput {
	data: AgentActionProps | null | undefined
}

@autoInjectable()
export class CreateAgentActionUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentActionRepository) private readonly agentActionRepository?: AgentActionRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!payload?.taskId || !payload?.chatId) throw new Error('chatId and taskId are required to create an action')

		const action = AgentAction.fromJSON({ ...payload })

		const result = await this.agentActionRepository?.create(action, params.scope ?? Scope.canEdit(currentUser))

		return { data: result?.toJSON() }
	}
}
