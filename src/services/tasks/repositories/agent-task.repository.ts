import { entityPatch } from '@common/base/utils'
import { MongoRepository, QueryOptions, QueryParams, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgentTask, AgentTaskProps } from '../entities'

export class AgentTaskRepository {
	public readonly _ = new MongoRepository<AgentTaskProps>({
		database: getDatabaseName(),
		collection: 'agent_tasks',
		scoped: true,
	})

	public async create (task: AgentTask, scope: Scope): Promise<AgentTask> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: task.toJSON(), scope })
		Object.assign(task, { _id, ownerId, createdAt, createdBy })
		return task
	}

	public async update (task: AgentTask, scope: Scope): Promise<AgentTaskProps | null> {
		return await this._.patchOne({ scope, where: { _id: task._id }, ...entityPatch(task) })
	}

	public async findById (id: string, scope: Scope, select?: QueryParams<AgentTaskProps>['select']): Promise<AgentTaskProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) }, select })
	}

	public async findByProps (where: AgentTaskProps, options: QueryOptions, scope: Scope): Promise<{ items: AgentTaskProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, options })
	}
}
