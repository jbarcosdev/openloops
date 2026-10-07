import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { WorkspaceItemRepository } from '../../repositories'
import { WorkspaceItem, WorkspaceItemProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	payload?: WorkspaceItemProps
}

export interface Output extends BaseUseCaseOutput {
	data: WorkspaceItemProps
}

@autoInjectable()
export class SaveWorkspaceItemUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(WorkspaceItemRepository) private readonly workspaceItemRepository?: WorkspaceItemRepository) {
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

		const existing = await this.workspaceItemRepository?.findByName(
			{ ownerId, chatId: item.chatId!, taskId: item.taskId, name: item.name! },
			{ _id: 1 },
		)

		if (existing?._id) {
			item.setId(existing._id)
			item.setUpdatedBy(currentUser)

			const result = await this.workspaceItemRepository?.update(item)
			if (!result) throw new Error('Workspace item update failed')

			return { data: result }
		}

		item.setCreatedBy(currentUser)
		item.setOwner(currentUser)

		const created = await this.workspaceItemRepository?.create(item)

		return { data: created!.toJSON() }
	}
}
