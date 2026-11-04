import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCall, LLMCallProps } from '../entities'
import { LLMCallRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export type Output = LLMCallProps | null | { deletedCount: number }

export class DeleteLLMCallUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository = new LLMCallRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			const result = await this.llmCallRepository.deleteById(id, params.scope ?? Scope.asAdmin(currentUser))
			return { deletedCount: result }
		}

		const result = await this.llmCallRepository.softDeleteById(id, params.scope ?? Scope.canManage(currentUser))
		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
