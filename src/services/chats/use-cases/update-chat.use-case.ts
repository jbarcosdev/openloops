import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { ChatRepository } from '../repositories'
import { Chat, ChatProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: ChatProps
	unset?: Record<string, ''>
}

export type Output = ChatProps

export class UpdateChatUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, unset, id, currentUser } = params

		if (!id) {
			throw new Error('Id is required for updating Chat')
		}

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating Chat')
		}

		const chat = Chat.fromJSON({ ...payload, _id: id })

		Object.assign(chat.clearedFields, unset)

		const result = await this.chatRepository.update(chat, params.scope ?? Scope.canEdit(currentUser))

		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
