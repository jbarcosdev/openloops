import { autoInjectable } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgenticJob, AgenticJobProps } from '../entities'

export interface ClaimParams {
	id: string
	workerId: string
	now: Date
	leaseMs: number
	nextRunAt?: Date
}

@autoInjectable()
export class AgenticJobRepository {
	public readonly _ = new MongoRepository<AgenticJobProps>({
		database: getDatabaseName(),
		collection: 'agentic_jobs',
	})

	public async create (job: AgenticJob): Promise<AgenticJob> {
		const id = await this._.createOne({ payload: job.toDocument() })
		id && job.setId(id)
		return job
	}

	public async update (job: AgenticJob, options?: { expectedVersion?: number }): Promise<AgenticJobProps | null> {
		if (options && typeof options.expectedVersion !== 'number') throw new Error('[AgenticJobRepository] The expected version is required to check for conflicts')

		return await this._.updateOne({
			where: { _id: job._id },
			payload: job.toFlatDocument(),
			expectedVersion: options?.expectedVersion,
		})
	}

	public async findById (id: string): Promise<AgenticJobProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByOwner (ownerId: string, options?: QueryOptions): Promise<AgenticJobProps[]> {
		return await this._.findMany({ where: { ownerId: new ObjectId(ownerId) }, options })
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findDue (now: Date, limit: number): Promise<AgenticJobProps[]> {
		return await this._.findMany({
			where: { enabled: true, nextRunAt: { $lte: now }, ...this.unlocked(now) } as any,
			options: { page: 1, limit, sortBy: { nextRunAt: 1 } },
		})
	}

	public async claim (params: ClaimParams): Promise<AgenticJobProps | null> {
		const { id, workerId, now, leaseMs, nextRunAt } = params

		return await this._.updateOne({
			where: { _id: this._.parseId(id), enabled: true, nextRunAt: { $lte: now }, ...this.unlocked(now) } as any,
			payload: {
				lockedBy: workerId,
				lockedUntil: new Date(now.getTime() + leaseMs),
				...(nextRunAt ? { nextRunAt } : { toUnset: { nextRunAt: '' } }),
			} as any,
		})
	}

	public async claimManual (params: Omit<ClaimParams, 'nextRunAt'>): Promise<AgenticJobProps | null> {
		const { id, workerId, now, leaseMs } = params

		return await this._.updateOne({
			where: { _id: this._.parseId(id), ...this.unlocked(now) } as any,
			payload: { lockedBy: workerId, lockedUntil: new Date(now.getTime() + leaseMs) },
		})
	}

	public async renewLease (id: string, workerId: string, until: Date): Promise<AgenticJobProps | null> {
		return await this._.updateOne({
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			payload: { lockedUntil: until },
		})
	}

	public async release (id: string, workerId: string, result: Pick<AgenticJobProps, 'lastRunAt' | 'lastRunStatus' | 'activeRunId'>): Promise<AgenticJobProps | null> {
		const { activeRunId, ...fields } = result

		return await this._.updateOne({
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			payload: {
				...fields,
				...(activeRunId ? { activeRunId } : {}),
				toUnset: { lockedBy: '', lockedUntil: '', ...(activeRunId ? {} : { activeRunId: '' }) },
			} as any,
		})
	}

	private unlocked (now: Date) {
		return { $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }] }
	}
}
