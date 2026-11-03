import { ObjectId } from 'mongodb'
import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, QueryParams, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
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
		database: getDatabaseName(),
		collection: 'workspace_items',
		scoped: true,
	})

	public async create (item: WorkspaceItem, scope: Scope): Promise<WorkspaceItem> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: item.toDocument(), scope })
		Object.assign(item, { _id, ownerId, createdAt, createdBy })
		return item
	}

	public async update (item: WorkspaceItem, scope: Scope): Promise<WorkspaceItemProps | null> {
		return await this._.updateOne({
			scope,
			where: { _id: item._id },
			payload: item.toDocument(),
		})
	}

	public async findById (id: string, scope: Scope, select?: QueryParams<WorkspaceItemProps>['select']): Promise<WorkspaceItemProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) }, select })
	}

	public async findByName (lookup: WorkspaceItemLookup, scope: Scope, select?: QueryParams<WorkspaceItemProps>['select']): Promise<WorkspaceItemProps | null> {
		const { ownerId, chatId, taskId, name } = lookup

		return await this._.findOne({
			scope,
			where: { ...(ownerId ? { ownerId } : {}), chatId, taskId: taskId ?? null, name } as any,
			select,
		})
	}

	public async findMany (where: Record<string, unknown>, scope: Scope, select?: QueryParams<WorkspaceItemProps>['select'], options?: QueryOptions): Promise<WorkspaceItemProps[]> {
		return await this._.findMany({ scope, where: where as any, select, options })
	}

	public async findManyPaginated (where: Record<string, unknown>, scope: Scope, select?: QueryParams<WorkspaceItemProps>['select'], options?: QueryOptions): Promise<{ items: WorkspaceItemProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where: where as any, select, options })
	}

	public async deleteById (id: string, scope: Scope): Promise<number> {
		return await this._.deleteOne({ scope, where: { _id: this._.parseId(id) } })
	}
}
