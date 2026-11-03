import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { WorkspaceItemRepository } from '../repositories'
import { WorkspaceItemProps, WorkspaceItemKind } from '../entities'

const DEFAULT_LIMIT = 50

export interface Params extends BaseUseCaseParams {
	chatId: string
	taskId?: string
	kind?: WorkspaceItemKind
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: WorkspaceItemProps[]
	hasMore?: boolean
}

@autoInjectable()
export class ListWorkspaceItemsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(WorkspaceItemRepository) private readonly workspaceItemRepository?: WorkspaceItemRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, taskId, kind, options, currentUser } = params

		if (!chatId) throw new Error('chatId is required')
		if (!currentUser) this.throwError403()

		const where = {
			ownerId: BaseEntity.toObjectId(currentUser?.userId),
			chatId: BaseEntity.toObjectId(chatId),
			...(taskId ? { taskId: BaseEntity.toObjectId(taskId) } : {}),
			...(kind ? { kind } : {}),
		}

		const result = await this.workspaceItemRepository?.findManyPaginated(
			where,
			params.scope ?? Scope.canView(currentUser),
			{ content: 0 },
			{ limit: DEFAULT_LIMIT, sortBy: { _id: -1 }, ...options },
		)

		return { data: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
