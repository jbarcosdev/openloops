import { ObjectId } from 'mongodb'
import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, QueryParams } from '@common/repositories'
import { secretManager } from '@common/utils/secret-manager'
import { WorkspaceItem, WorkspaceItemProps } from '../entities'

export interface WorkspaceItemLookup {
	ownerId?: ObjectId
	chatId: ObjectId
	taskId?: ObjectId
	name: string
}

@autoInjectable()
export class WorkspaceItemRepository {
	public readonly _ = new MongoRepository<WorkspaceItemProps>({
		database: secretManager.get('OPENLOOPS_DB_NAME'),
		collection: 'workspace_items',
	})

	public async create (item: WorkspaceItem): Promise<WorkspaceItem> {
		const id = await this._.createOne({ payload: item.toDocument() })
		id && item.setId(id)
		return item
	}

	public async update (item: WorkspaceItem): Promise<WorkspaceItemProps | null> {
		return await this._.updateOne({
			where: { _id: item._id },
			payload: item.toDocument(),
		})
	}

	public async findById (id: string, select?: QueryParams<WorkspaceItemProps>['select']): Promise<WorkspaceItemProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) }, select })
	}

	public async findByName (lookup: WorkspaceItemLookup, select?: QueryParams<WorkspaceItemProps>['select']): Promise<WorkspaceItemProps | null> {
		const { ownerId, chatId, taskId, name } = lookup

		return await this._.findOne({
			where: { ...(ownerId ? { ownerId } : {}), chatId, taskId: taskId ?? null, name } as any,
			select,
		})
	}

	public async findMany (where: Record<string, unknown>, select?: QueryParams<WorkspaceItemProps>['select'], options?: QueryOptions): Promise<WorkspaceItemProps[]> {
		return await this._.findMany({ where: where as any, select, options })
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}
}
