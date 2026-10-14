import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobProps } from '../entities'
import { AgenticJobRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobProps | null
}

@autoInjectable()
export class GetAgenticJobByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id } = params
		const result = await this.agenticJobRepository?.findById(id)

		return { data: result ?? null }
	}
}
