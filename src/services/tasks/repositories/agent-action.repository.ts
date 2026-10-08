import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { secretManager } from '@common/utils/secret-manager'
import { AgentAction, AgentActionProps } from '../entities'

@autoInjectable()
export class AgentActionRepository {
	public readonly _ = new MongoRepository<AgentActionProps>({
		database: secretManager.get('OPENLOOPS_DB_NAME'),
		collection: 'agent_actions',
	})

	public async create (action: AgentAction): Promise<AgentAction> {
		const id = await this._.createOne({ payload: action.toDocument() })
		id && action.setId(id)
		return action
	}

	public async update (action: AgentAction): Promise<AgentActionProps | null> {
		const toUnset = action.clearedFields

		return await this._.updateOne({
			where: { _id: action._id },
			payload: { ...action.toDocument(), ...(Object.keys(toUnset).length ? { toUnset } : {}) },
		})
	}

	public async findByProps (where: AgentActionProps, options: QueryOptions): Promise<AgentActionProps[]> {
		return await this._.findMany({ where, options })
	}
}
