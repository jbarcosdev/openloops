import { autoInjectable } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { ChatRepository } from '../../repositories'
import { ChatProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	filters?: Partial<ChatProps>
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps[] | null
}

@autoInjectable()
export class ListChatsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { options, currentUser } = params
		const { page = 1, limit: pageSize = 10 } = options || {}

		const results = await this.chatRepository._.findMany({
			where: { 
				ownerId: new ObjectId(currentUser?.userId),
			},
			options: { page, limit: pageSize, sortBy: { updatedAt: -1 } },
		})

		return { data: results }
	}
}
