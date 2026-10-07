import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { BaseEntity } from '@common/base/base.entity'
import { WorkspaceItemRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	chatId: string
	name: string
	taskId?: string
}

export interface Output extends BaseUseCaseOutput {
	data: { deletedCount: number }
}

@autoInjectable()
export class DeleteWorkspaceItemUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(WorkspaceItemRepository) private readonly workspaceItemRepository?: WorkspaceItemRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, name, taskId, currentUser } = params

		if (!chatId || !name) throw new Error('chatId and name are required')
		if (!currentUser) this.throwError403()

		const existing = await this.workspaceItemRepository?.findByName(
			{
				ownerId: BaseEntity.toObjectId(currentUser?.userId),
				chatId: BaseEntity.toObjectId(chatId)!,
				taskId: BaseEntity.toObjectId(taskId),
				name,
			},
			{ _id: 1 },
		)

		if (!existing?._id) return { data: { deletedCount: 0 } }

		const deletedCount = await this.workspaceItemRepository?.deleteById(existing._id.toString())

		return { data: { deletedCount: deletedCount ?? 0 } }
	}
}
