import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobRunProps, AgenticJobRunStatus } from '../entities'
import { AgenticJobRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	status?: AgenticJobRunStatus
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobRunProps[]
}

@autoInjectable()
export class ListAgenticJobRunsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { status, options, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to list the runs of the agentic jobs')

		const { page = 1, limit = 10, sortBy = { createdAt: -1 } } = options || {}
		const results = await this.agenticJobRunRepository?.findByOwner(currentUser.userId, { page, limit, sortBy }, status)

		return { data: results ?? [] }
	}
}
