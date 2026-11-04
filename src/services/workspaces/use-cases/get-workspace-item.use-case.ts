import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { BaseEntity } from '@common/base/base.entity'
import { WorkspaceItemRepository } from '../repositories'
import { WorkspaceItemProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	chatId: string
	name: string
	taskId?: string
	includeContent?: boolean
}

export type Output = WorkspaceItemProps | null

export class GetWorkspaceItemUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly workspaceItemRepository = new WorkspaceItemRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { chatId, name, taskId, includeContent = true, currentUser } = params

		if (!chatId || !name) throw new Error('chatId and name are required')
		if (!currentUser) this.throwError403()

		const ownerId = BaseEntity.toObjectId(currentUser?.userId)
		const select = includeContent ? undefined : { content: 0 as const }

		const lookups = [
			...(taskId ? [{ ownerId, chatId: BaseEntity.toObjectId(chatId)!, taskId: BaseEntity.toObjectId(taskId), name }] : []),
			{ ownerId, chatId: BaseEntity.toObjectId(chatId)!, taskId: undefined, name },
		]

		for (const lookup of lookups) {
			const data = await this.workspaceItemRepository.findByName(lookup, params.scope ?? Scope.canView(currentUser), select)
			if (data) return data
		}

		return null
	}
}
