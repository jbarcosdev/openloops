import { entityPatch } from '@common/base/utils'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgentAction, AgentActionProps } from '../entities'

export class AgentActionRepository {
	public readonly _ = new MongoRepository<AgentActionProps>({
		database: getDatabaseName(),
		collection: 'agent_actions',
		scoped: true,
	})

	public async create (action: AgentAction, scope: Scope): Promise<AgentAction> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: action.toJSON(), scope })
		Object.assign(action, { _id, ownerId, createdAt, createdBy })
		return action
	}

	public async update (action: AgentAction, scope: Scope): Promise<AgentActionProps | null> {
		return await this._.patchOne({ scope, where: { _id: action._id }, ...entityPatch(action) })
	}

	public async findByProps (where: AgentActionProps, options: QueryOptions, scope: Scope): Promise<{ items: AgentActionProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, options })
	}
}
