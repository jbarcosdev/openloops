import { QueryOptions, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { ChatRepository } from '../repositories'
import { ChatProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	where: Partial<ChatProps>
	options?: QueryOptions
}

export interface Output {
	items: ChatProps[]
	hasMore: boolean
}

export class ListChatsByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options, currentUser } = params
		const result = await this.chatRepository.findByProps(where, options || {}, params.scope ?? Scope.asAdmin(currentUser))

		return { items: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
