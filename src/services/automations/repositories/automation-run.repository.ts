import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AutomationRun, AutomationRunProps, AutomationRunStatus } from '../entities'

export class AutomationRunRepository {
	public readonly _ = new MongoRepository<AutomationRunProps>({
		database: getDatabaseName(),
		collection: 'automation_runs',
		scoped: true,
	})

	public async create (run: AutomationRun, scope: Scope): Promise<AutomationRun> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: run.toDocument(), scope })
		Object.assign(run, { _id, ownerId, createdAt, createdBy })
		return run
	}

	public async update (run: AutomationRun, scope: Scope): Promise<AutomationRunProps | null> {
		return await this._.updateOne({
			scope,
			where: { _id: run._id },
			payload: run.toFlatDocument(),
		})
	}

	public async findById (id: string, scope: Scope): Promise<AutomationRunProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findByAutomation (automationId: string, scope: Scope, options?: QueryOptions): Promise<AutomationRunProps[]> {
		return await this._.findMany({ scope, where: { automationId: new ObjectId(automationId) }, options })
	}

	public async findByOwner (ownerId: string, scope: Scope, options?: QueryOptions, status?: AutomationRunStatus): Promise<AutomationRunProps[]> {
		return await this._.findMany({ scope, where: { ownerId: new ObjectId(ownerId), ...(status ? { status } : {}) }, options })
	}

	public async findByStatus (status: AutomationRunStatus, limit: number, scope: Scope): Promise<AutomationRunProps[]> {
		return await this._.findMany({ scope, where: { status }, options: { page: 1, limit, sortBy: { createdAt: 1 } } })
	}

	public async findByIdempotencyKey (automationId: string, idempotencyKey: string, scope: Scope): Promise<AutomationRunProps | null> {
		return await this._.findOne({ scope, where: { automationId: new ObjectId(automationId), idempotencyKey } })
	}

	public async countQueued (automationId: string, scope: Scope): Promise<number> {
		return await this._.count({ scope, where: { automationId: new ObjectId(automationId), status: 'queued' } })
	}

	public async claimQueued (id: string, fields: Pick<AutomationRunProps, 'workerId' | 'startedAt' | 'instructions' | 'modelProvider' | 'modelName'>, scope: Scope): Promise<AutomationRunProps | null> {
		return await this._.updateOne({
			scope,
			where: { _id: this._.parseId(id), status: 'queued' } as any,
			payload: { ...fields, status: 'running' },
		})
	}
}
