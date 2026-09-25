import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { LLMCallRepository } from '../../repositories'
import { QueryOptions } from '@common/repositories'
import { LLMCallProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	where: LLMCallProps
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps[] | null | undefined
}

@autoInjectable()
export class ListLLMCallsByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options } = params
		const result = await this.llmCallRepository?.findByProps(where, options)

		return { data: result }
	}
}
