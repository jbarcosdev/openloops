import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { BaseEntity } from '@common/base/base.entity'
import { WorkspaceItemRepository } from '../repositories'
import { WorkspaceItem, WorkspaceItemProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	payload?: WorkspaceItemProps
}

export interface Output extends BaseUseCaseOutput {
	data: WorkspaceItemProps
}

export class SaveWorkspaceItemUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly workspaceItemRepository = new WorkspaceItemRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!payload?.chatId) throw new Error('chatId is required to save a workspace item')
		if (!payload?.name) throw new Error('name is required to save a workspace item')
		if (!currentUser) this.throwError403()

		const ownerId = BaseEntity.toObjectId(currentUser?.userId)

		const item = WorkspaceItem.fromJSON({ ...payload })
		item.refreshSize()

		const scope = params.scope ?? Scope.canEdit(currentUser)

		const existing = await this.workspaceItemRepository.findByName(
			{ ownerId, chatId: item.chatId!, taskId: item.taskId, name: item.name! },
			scope,
			{ _id: 1 },
		)

		if (existing?._id) {
			item._id = BaseEntity.toObjectId(existing._id)
			const result = await this.workspaceItemRepository.update(item, scope)
			if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

			return { data: result }
		}

		const created = await this.workspaceItemRepository.create(item, scope)

		return { data: created!.toJSON() }
	}
}
