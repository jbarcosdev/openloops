import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { ChatRepository } from '../repositories'
import { ChatProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	where: Partial<ChatProps>
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps[] | null | undefined
	hasMore?: boolean
}

@autoInjectable()
export class ListChatsByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(ChatRepository) private readonly chatRepository?: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options, currentUser } = params
		const result = await this.chatRepository?.findByProps(where, options || {}, params.scope ?? Scope.asAdmin(currentUser))

		return { data: result?.items, hasMore: result?.hasMore }
	}
}
