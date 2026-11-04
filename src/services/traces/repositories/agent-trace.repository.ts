import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgentTraceEntry, AgentTraceEntryProps } from '../entities'

export class AgentTraceRepository {
	public readonly _ = new MongoRepository<AgentTraceEntryProps>({
		database: getDatabaseName(),
		collection: 'agent_traces',
		scoped: true,
	})

	public async createMany (entries: AgentTraceEntry[], scope: Scope): Promise<number> {
		if (!entries.length) return 0

		const ids = await this._.createMany({ scope, payload: entries.map(entry => entry.toDocument()) })
		return Object.keys(ids).length
	}

	public async findByProps (where: AgentTraceEntryProps, options: QueryOptions, scope: Scope): Promise<{ items: AgentTraceEntryProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, options })
	}
}
