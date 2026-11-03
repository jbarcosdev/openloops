import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgentAction, AgentActionProps } from '../entities'

@autoInjectable()
export class AgentActionRepository {
	public readonly _ = new MongoRepository<AgentActionProps>({
		database: getDatabaseName(),
		collection: 'agent_actions',
		scoped: true,
	})

	public async create (action: AgentAction, scope: Scope): Promise<AgentAction> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: action.toDocument(), scope })
		Object.assign(action, { _id, ownerId, createdAt, createdBy })
		return action
	}

	public async update (action: AgentAction, scope: Scope): Promise<AgentActionProps | null> {
		const toUnset = action.clearedFields

		return await this._.updateOne({
			scope,
			where: { _id: action._id },
			payload: { ...action.toDocument(), ...(Object.keys(toUnset).length ? { toUnset } : {}) },
		})
	}

	public async findByProps (where: AgentActionProps, options: QueryOptions, scope: Scope): Promise<{ items: AgentActionProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, options })
	}
}
