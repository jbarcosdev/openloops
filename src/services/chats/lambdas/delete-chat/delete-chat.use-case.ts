import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { ChatRepository } from '../../repositories'
import { ChatProps, Chat } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps
}

@autoInjectable()
export class DeleteChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(ChatRepository) private readonly chatRepository?: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			if (!currentUser?.isAdmin()) this.throwError403()

			const result = await this.chatRepository?.deleteById(id)
			return { data: { deletedCount: result } as any }
		}

		// soft delete
		const chat = Chat.fromJSON({ _id: id })
		chat.setDeletedBy(currentUser)
		const result = await this.chatRepository?.update(chat)

		return { data: result || {} }
	}
}
