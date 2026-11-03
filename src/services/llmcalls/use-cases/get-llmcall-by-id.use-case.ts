import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCallRepository } from '../repositories'
import { LLMCallProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps | null | undefined
}

@autoInjectable()
export class GetLLMCallByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.llmCallRepository?.findById(id, params.scope ?? Scope.canView(currentUser))
		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
