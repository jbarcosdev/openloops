import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { ChatRepository } from '../repositories'
import { Chat, ChatProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	payload?: ChatProps
}

export type Output = ChatProps

export class CreateChatUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const chat = Chat.fromJSON({ ...payload })

		const result = await this.chatRepository.create(chat, params.scope ?? Scope.canEdit(currentUser))

		return result.toJSON()
	}
}
