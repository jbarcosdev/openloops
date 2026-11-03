import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AgentTraceRepository } from '../repositories'
import { AgentTraceEntry, AgentTraceEntryProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	payload?: AgentTraceEntryProps[]
}

export interface Output extends BaseUseCaseOutput {
	data: { insertedCount: number }
}

@autoInjectable()
export class CreateAgentTracesUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgentTraceRepository) private readonly agentTraceRepository?: AgentTraceRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const entries = (payload ?? []).map(props => AgentTraceEntry.fromJSON({ ...props }))

		const insertedCount = await this.agentTraceRepository?.createMany(entries, params.scope ?? Scope.canEdit(currentUser)) ?? 0

		return { data: { insertedCount } }
	}
}
