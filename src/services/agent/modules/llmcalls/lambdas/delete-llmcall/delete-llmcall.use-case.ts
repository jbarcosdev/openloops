import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { LLMCall, LLMCallProps } from '../../entities'
import { LLMCallRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps | null
}

@autoInjectable()
export class DeleteLLMCallUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			if (!currentUser?.isAdmin()) this.throwError403()

			const result = await this.llmCallRepository.deleteById(id)
			return { data: { deletedCount: result } as any }
		}

		// soft delete
		const llmCall = LLMCall.fromJSON({ _id: id })
		llmCall.setDeletedBy(currentUser)
		const result = await this.llmCallRepository.update(llmCall)

		return { data: result }
	}
}
