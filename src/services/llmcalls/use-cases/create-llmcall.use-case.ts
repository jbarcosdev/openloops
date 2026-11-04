import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCall, LLMCallProps } from '../entities'
import { LLMCallRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	payload?: LLMCallProps
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps | null
}

export class CreateLLMCallUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository = new LLMCallRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const llmCall = LLMCall.fromJSON({ ...payload })

		const result = await this.llmCallRepository.create(llmCall, params.scope ?? Scope.canEdit(currentUser))

		return { data: llmCall.toJSON() }
	}
}
