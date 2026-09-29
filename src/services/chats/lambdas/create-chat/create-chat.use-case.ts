import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { ChatRepository } from '../../repositories'
import { Chat, ChatProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	payload?: ChatProps
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps | null | undefined
}

@autoInjectable()
export class CreateChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(ChatRepository) private readonly chatRepository?: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const chat = Chat.fromJSON({ ...payload })
		chat.setCreatedBy(currentUser)
		chat.setOwner(currentUser)

		const result = await this.chatRepository?.create(chat)

		return { data: result }
	}
}
