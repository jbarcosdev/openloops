import { autoInjectable, inject } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { ChatRepository } from '../repositories'
import { ChatProps, ExecutionMode } from '../entities'

export interface Params extends BaseUseCaseParams {
	filters?: Partial<ChatProps>
	executionMode?: ExecutionMode
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps[] | null | undefined
}

@autoInjectable()
export class ListChatsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(ChatRepository) private readonly chatRepository?: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { options, executionMode, currentUser } = params
		const { page = 1, limit: pageSize = 10 } = options || {}

		const results = await this.chatRepository?._.findMany({
			where: { 
				ownerId: new ObjectId(currentUser?.userId),
				...(executionMode === 'autonomous' ? { 'settings.executionMode': 'autonomous' } : {}),
				...(executionMode === 'interactive' ? { 'settings.executionMode': { $ne: 'autonomous' } } : {}),
			},
			options: { page, limit: pageSize, sortBy: { updatedAt: -1 } },
		})

		return { data: results }
	}
}
