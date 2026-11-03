import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgentAction, AgentActionProps } from '../entities'

@autoInjectable()
export class AgentActionRepository {
	public readonly _ = new MongoRepository<AgentActionProps>({
		database: getDatabaseName(),
		collection: 'agent_actions',
	})

	public async create (action: AgentAction): Promise<AgentAction> {
		const { _id } = await this._.createOne({ payload: action.toDocument() })
		action.setId(_id)
		return action
	}

	public async update (action: AgentAction): Promise<AgentActionProps | null> {
		const toUnset = action.clearedFields

		return await this._.updateOne({
			where: { _id: action._id },
			payload: { ...action.toDocument(), ...(Object.keys(toUnset).length ? { toUnset } : {}) },
		})
	}

	public async findByProps (where: AgentActionProps, options: QueryOptions): Promise<{ items: AgentActionProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ where, options })
	}
}
