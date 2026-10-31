import { autoInjectable } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { Automation, AutomationProps, AutomationRunStatus } from '../entities'

export interface ClaimParams {
	id: string
	workerId: string
	now: Date
	leaseMs: number
	nextRunAt?: Date
}

@autoInjectable()
export class AutomationRepository {
	public readonly _ = new MongoRepository<AutomationProps>({
		database: getDatabaseName(),
		collection: 'automations',
	})

	public async create (automation: Automation): Promise<Automation> {
		const id = await this._.createOne({ payload: automation.toDocument() })
		id && automation.setId(id)
		return automation
	}

	public async update (automation: Automation, options?: { expectedVersion?: number }): Promise<AutomationProps | null> {
		if (options && typeof options.expectedVersion !== 'number') throw new Error('[AutomationRepository] The expected version is required to check for conflicts')

		return await this._.updateOne({
			where: { _id: automation._id },
			payload: automation.toFlatDocument(),
			expectedVersion: options?.expectedVersion,
		})
	}

	public async findById (id: string): Promise<AutomationProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByOwner (ownerId: string, options?: QueryOptions): Promise<AutomationProps[]> {
		return await this._.findMany({ where: { ownerId: new ObjectId(ownerId) }, options })
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findDue (now: Date, limit: number): Promise<AutomationProps[]> {
		return await this._.findMany({
			where: { enabled: true, nextRunAt: { $lte: now }, ...this.unlocked(now) } as any,
			options: { page: 1, limit, sortBy: { nextRunAt: 1 } },
		})
	}

	public async claim (params: ClaimParams): Promise<AutomationProps | null> {
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

	public async claimManual (params: Omit<ClaimParams, 'nextRunAt'>): Promise<AutomationProps | null> {
		const { id, workerId, now, leaseMs } = params

		return await this._.updateOne({
			where: { _id: this._.parseId(id), ...this.unlocked(now) } as any,
			payload: { lockedBy: workerId, lockedUntil: new Date(now.getTime() + leaseMs) },
		})
	}

	public async setActiveRun (id: string, workerId: string, runId: string): Promise<AutomationProps | null> {
		return await this._.updateOne({
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			payload: { activeRunId: this._.parseId(runId) } as any,
		})
	}

	public async settleRun (id: string, runId: string, status: AutomationRunStatus, at: Date): Promise<AutomationProps | null> {
		return await this._.updateOne({
			where: { _id: this._.parseId(id), activeRunId: this._.parseId(runId) } as any,
			payload: { lastRunStatus: status, lastRunAt: at, toUnset: { activeRunId: '' } } as any,
		})
	}

	public async renewLease (id: string, workerId: string, until: Date): Promise<AutomationProps | null> {
		return await this._.updateOne({
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			payload: { lockedUntil: until },
		})
	}

	public async release (id: string, workerId: string, result: Pick<AutomationProps, 'lastRunAt' | 'lastRunStatus' | 'activeRunId'>): Promise<AutomationProps | null> {
		const { activeRunId, lastRunAt, lastRunStatus } = result

		return await this._.updateOne({
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			payload: {
				...(lastRunAt ? { lastRunAt } : {}),
				...(lastRunStatus ? { lastRunStatus } : {}),
				...(activeRunId ? { activeRunId } : {}),
				toUnset: { lockedBy: '', lockedUntil: '', ...(activeRunId ? {} : { activeRunId: '' }) },
			} as any,
		})
	}

	private unlocked (now: Date) {
		return { $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }] }
	}
}
