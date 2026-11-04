import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { LLMCallRepository } from '../repositories'
import { QueryOptions, Scope } from '@common/repositories'
import { LLMCallProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	where: LLMCallProps
	options?: QueryOptions
}

export interface Output {
	items: LLMCallProps[]
	hasMore: boolean
}

export class ListLLMCallsByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly llmCallRepository = new LLMCallRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options, currentUser } = params
		const result = await this.llmCallRepository.findByProps(where, params.scope ?? Scope.asAdmin(currentUser), options)

		return { items: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
