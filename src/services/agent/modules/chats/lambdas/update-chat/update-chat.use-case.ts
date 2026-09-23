import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { ChatRepository } from '../../repositories'
import { Chat, ChatProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: ChatProps
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps
}

@autoInjectable()
export class UpdateChatUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!id) {
			throw new Error('Id is required for updating Chat')
		}

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating Chat')
		}

		const chat = Chat.fromJSON({ ...payload, _id: id })
		chat.setUpdatedBy(currentUser)

		const result = await this.chatRepository.update(chat)

		if (!result) {
			throw new Error('Chat not found or update failed')
		}

		return { data: result }
	}
}
