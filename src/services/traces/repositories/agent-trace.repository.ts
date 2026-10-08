import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { secretManager } from '@common/utils/secret-manager'
import { AgentTraceEntry, AgentTraceEntryProps } from '../entities'

@autoInjectable()
export class AgentTraceRepository {
	public readonly _ = new MongoRepository<AgentTraceEntryProps>({
		database: secretManager.get('OPENLOOPS_DB_NAME'),
		collection: 'agent_traces',
	})

	public async createMany (entries: AgentTraceEntry[]): Promise<number> {
		if (!entries.length) return 0

		const ids = await this._.createMany({ payload: entries.map(entry => entry.toDocument()) })
		return Object.keys(ids).length
	}

	public async findByProps (where: AgentTraceEntryProps, options: QueryOptions): Promise<AgentTraceEntryProps[]> {
		return await this._.findMany({ where, options })
	}
}
