import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { LLMCallRepository } from '../../repositories'
import { LLMCallProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps | null
}

@autoInjectable()
export class GetLLMCallByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id } = params
		const result = await this.llmCallRepository.findById(id)

		return { data: result }
	}
}
