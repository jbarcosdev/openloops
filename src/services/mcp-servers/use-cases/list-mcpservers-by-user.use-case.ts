import { ObjectId } from 'mongodb'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServerRepository } from '../repositories'
import { McpServerProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	filters?: Partial<McpServerProps>
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps[] | null | undefined
	hasMore?: boolean
}

export class ListMcpServersByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository = new McpServerRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { options, currentUser } = params
		const { page = 1, limit: pageSize = 10 } = options || {}

		const result = await this.mcpServerRepository._.findManyPaginated({
			where: { 
				ownerId: new ObjectId(currentUser?.userId),
			},
			options: { page, limit: pageSize, sortBy: { updatedAt: -1 } },
		})

		return { data: result?.items, hasMore: result?.hasMore }
	}
}
