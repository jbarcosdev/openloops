import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgentTraceRepository } from '../../repositories'
import { AgentTraceEntry, AgentTraceEntryProps } from '../../entities'

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

		const entries = (payload ?? []).map(props => {
			const entry = AgentTraceEntry.fromJSON({ ...props })
			entry.setCreatedBy(currentUser)
			entry.setOwner(currentUser)
			return entry
		})

		const insertedCount = await this.agentTraceRepository?.createMany(entries) ?? 0

		return { data: { insertedCount } }
	}
}
