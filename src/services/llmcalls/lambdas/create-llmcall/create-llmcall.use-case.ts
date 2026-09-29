import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { LLMCall, LLMCallProps } from '../../entities'
import { LLMCallRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	payload?: LLMCallProps
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps | null
}

@autoInjectable()
export class CreateLLMCallUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const llmCall = LLMCall.fromJSON({ ...payload })
		llmCall.setCreatedBy(currentUser)
		llmCall.setOwner(currentUser)

		const result = await this.llmCallRepository?.create(llmCall)

		return { data: llmCall.toJSON() }
	}
}
