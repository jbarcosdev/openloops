import { autoInjectable } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AutomationRun, AutomationRunProps, AutomationRunStatus } from '../entities'

@autoInjectable()
export class AutomationRunRepository {
	public readonly _ = new MongoRepository<AutomationRunProps>({
		database: getDatabaseName(),
		collection: 'automation_runs',
	})

	public async create (run: AutomationRun): Promise<AutomationRun> {
		const id = await this._.createOne({ payload: run.toDocument() })
		id && run.setId(id)
		return run
	}

	public async update (run: AutomationRun): Promise<AutomationRunProps | null> {
		return await this._.updateOne({
			where: { _id: run._id },
			payload: run.toFlatDocument(),
		})
	}

	public async findById (id: string): Promise<AutomationRunProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByAutomation (automationId: string, options?: QueryOptions): Promise<AutomationRunProps[]> {
		return await this._.findMany({ where: { automationId: new ObjectId(automationId) }, options })
	}

	public async findByOwner (ownerId: string, options?: QueryOptions, status?: AutomationRunStatus): Promise<AutomationRunProps[]> {
		return await this._.findMany({ where: { ownerId: new ObjectId(ownerId), ...(status ? { status } : {}) }, options })
	}

	public async findByStatus (status: AutomationRunStatus, limit: number): Promise<AutomationRunProps[]> {
		return await this._.findMany({ where: { status }, options: { page: 1, limit, sortBy: { createdAt: 1 } } })
	}

	public async findByIdempotencyKey (automationId: string, idempotencyKey: string): Promise<AutomationRunProps | null> {
		return await this._.findOne({ where: { automationId: new ObjectId(automationId), idempotencyKey } })
	}

	public async countQueued (automationId: string): Promise<number> {
		return await this._.count({ where: { automationId: new ObjectId(automationId), status: 'queued' } })
	}

	public async claimQueued (id: string, fields: Pick<AutomationRunProps, 'workerId' | 'startedAt' | 'instructions' | 'modelProvider' | 'modelName'>): Promise<AutomationRunProps | null> {
		return await this._.updateOne({
			where: { _id: this._.parseId(id), status: 'queued' } as any,
			payload: { ...fields, status: 'running' },
		})
	}
}
