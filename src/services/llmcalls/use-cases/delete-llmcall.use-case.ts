import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCall, LLMCallProps } from '../entities'
import { LLMCallRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps | null | undefined
}

@autoInjectable()
export class DeleteLLMCallUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			const result = await this.llmCallRepository?.deleteById(id, params.scope ?? Scope.asAdmin(currentUser))
			return { data: { deletedCount: result } as any }
		}

		const result = await this.llmCallRepository?.softDeleteById(id, params.scope ?? Scope.canManage(currentUser))
		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
