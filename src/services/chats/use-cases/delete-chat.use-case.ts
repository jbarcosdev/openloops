import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { ChatRepository } from '../repositories'
import { ChatProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export type Output = ChatProps | { deletedCount: number }

export class DeleteChatUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			const result = await this.chatRepository.deleteById(id, params.scope ?? Scope.asAdmin(currentUser))
			return { deletedCount: result }
		}

		const result = await this.chatRepository.softDeleteById(id, params.scope ?? Scope.canManage(currentUser))
		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
