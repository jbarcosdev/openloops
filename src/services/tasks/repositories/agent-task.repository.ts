import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, QueryParams } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgentTask, AgentTaskProps } from '../entities'

@autoInjectable()
export class AgentTaskRepository {
	public readonly _ = new MongoRepository<AgentTaskProps>({
		database: getDatabaseName(),
		collection: 'agent_tasks',
	})

	public async create (task: AgentTask): Promise<AgentTask> {
		const id = await this._.createOne({ payload: task.toDocument() })
		id && task.setId(id)
		return task
	}

	public async update (task: AgentTask): Promise<AgentTaskProps | null> {
		const toUnset = task.clearedFields

		return await this._.updateOne({
			where: { _id: task._id },
			payload: { ...task.toDocument(), ...(Object.keys(toUnset).length ? { toUnset } : {}) },
		})
	}

	public async findById (id: string, select?: QueryParams<AgentTaskProps>['select']): Promise<AgentTaskProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) }, select })
	}

	public async findByProps (where: AgentTaskProps, options: QueryOptions): Promise<AgentTaskProps[]> {
		return await this._.findMany({ where, options })
	}
}
