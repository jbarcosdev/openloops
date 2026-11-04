import { ObjectId } from 'mongodb'
import { QueryOptions, Scope } from '@common/repositories'
import { escapeRegex } from '@common/helpers'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { ChatRepository } from '../repositories'
import { ChatProps, ExecutionMode } from '../entities'

export interface Params extends BaseUseCaseParams {
	filters?: Partial<ChatProps>
	executionMode?: ExecutionMode
	search?: string
	options?: QueryOptions
}

export interface Output {
	items: ChatProps[]
	hasMore: boolean
}

export class ListChatsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { options, executionMode, search, currentUser } = params
		const { page = 1, limit: pageSize = 10 } = options || {}

		const term = escapeRegex(search?.trim())

		const result = await this.chatRepository._.findManyPaginated({
			scope: params.scope ?? Scope.canView(currentUser),
			where: { 
				ownerId: new ObjectId(currentUser?.userId),
				...(executionMode === 'autonomous' ? { 'settings.executionMode': 'autonomous' } : {}),
				...(executionMode === 'interactive' ? { 'settings.executionMode': { $ne: 'autonomous' } } : {}),
				...(term ? { 'messages.content': { $regex: term, $options: 'i' } } : {}),
			},
			options: { page, limit: pageSize, sortBy: { updatedAt: -1 } },
		})

		return { items: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
