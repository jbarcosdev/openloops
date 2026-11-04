import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCallRepository } from '../repositories'
import { LLMCallProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export type Output = LLMCallProps | null

export class GetLLMCallByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository = new LLMCallRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.llmCallRepository.findById(id, params.scope ?? Scope.canView(currentUser))
		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
