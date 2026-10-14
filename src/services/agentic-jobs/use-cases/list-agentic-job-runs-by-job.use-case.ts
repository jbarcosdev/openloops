import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobRunProps } from '../entities'
import { AgenticJobRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	jobId: string
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobRunProps[]
}

@autoInjectable()
export class ListAgenticJobRunsByJobUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { jobId, options } = params
		if (!jobId) throw new Error('Missing jobId')

		const { page = 1, limit = 10, sortBy = { createdAt: -1 } } = options || {}
		const results = await this.agenticJobRunRepository?.findByJob(jobId, { page, limit, sortBy })

		return { data: results ?? [] }
	}
}
