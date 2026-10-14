import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobProps } from '../entities'
import { AgenticJobRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobProps[]
}

@autoInjectable()
export class ListAgenticJobsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { options, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to list the agentic jobs')

		const { page = 1, limit = 10, sortBy = { createdAt: -1 } } = options || {}
		const results = await this.agenticJobRepository?.findByOwner(currentUser.userId, { page, limit, sortBy })

		return { data: results ?? [] }
	}
}
