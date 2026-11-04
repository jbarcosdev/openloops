import { ObjectId } from 'mongodb'
import { entityPatch } from '@common/base/utils'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { Automation, AutomationProps, AutomationRunStatus } from '../entities'

export interface ClaimParams {
	id: string
	workerId: string
	now: Date
	leaseMs: number
	nextRunAt?: Date
}

export class AutomationRepository {
	public readonly _ = new MongoRepository<AutomationProps>({
		database: getDatabaseName(),
		collection: 'automations',
		scoped: true,
	})

	public async create (automation: Automation, scope: Scope): Promise<Automation> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: automation.toJSON(), scope })
		Object.assign(automation, { _id, ownerId, createdAt, createdBy })
		return automation
	}

	public async update (automation: Automation, scope: Scope, options?: { expectedVersion?: number }): Promise<AutomationProps | null> {
		if (options && typeof options.expectedVersion !== 'number') throw new Error('[AutomationRepository] The expected version is required to check for conflicts')

		return await this._.patchOne({ scope, where: { _id: automation._id }, ...entityPatch(automation), expectedVersion: options?.expectedVersion })
	}

	public async findById (id: string, scope: Scope): Promise<AutomationProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findByOwner (ownerId: string, scope: Scope, options?: QueryOptions): Promise<AutomationProps[]> {
		return await this._.findMany({ scope, where: { ownerId: new ObjectId(ownerId) }, options })
	}

	public async softDeleteById (id: string, scope: Scope): Promise<AutomationProps | null> {
		return await this._.softDelete({ scope, where: { _id: this._.parseId(id) }, unset: { 'triggers.schedule.nextRunAt': '' } })
	}

	public async deleteById (id: string, scope: Scope): Promise<number> {
		return await this._.deleteOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findDue (now: Date, limit: number, scope: Scope): Promise<AutomationProps[]> {
		return await this._.findMany({
			scope,
			where: { 'triggers.schedule.enabled': true, 'triggers.schedule.nextRunAt': { $lte: now }, ...this.unlocked(now) } as any,
			options: { page: 1, limit, sortBy: { 'triggers.schedule.nextRunAt': 1 } },
		})
	}

	public async claim (params: ClaimParams, scope: Scope): Promise<AutomationProps | null> {
		const { id, workerId, now, leaseMs, nextRunAt } = params

		return await this._.patchOne({
			scope,
			where: { _id: this._.parseId(id), 'triggers.schedule.enabled': true, 'triggers.schedule.nextRunAt': { $lte: now }, ...this.unlocked(now) } as any,
			set: {
				lockedBy: workerId,
				lockedUntil: new Date(now.getTime() + leaseMs),
				...(nextRunAt ? { 'triggers.schedule.nextRunAt': nextRunAt } : {}),
			},
			unset: nextRunAt ? {} : { 'triggers.schedule.nextRunAt': '' },
		})
	}

	public async claimManual (params: Omit<ClaimParams, 'nextRunAt'>, scope: Scope): Promise<AutomationProps | null> {
		const { id, workerId, now, leaseMs } = params

		return await this._.patchOne({
			scope,
			where: { _id: this._.parseId(id), ...this.unlocked(now) } as any,
			set: { lockedBy: workerId, lockedUntil: new Date(now.getTime() + leaseMs) },
		})
	}

	public async setActiveRun (id: string, workerId: string, runId: string, scope: Scope): Promise<AutomationProps | null> {
		return await this._.patchOne({
			scope,
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			set: { activeRunId: this._.parseId(runId) },
		})
	}

	public async settleRun (id: string, runId: string, status: AutomationRunStatus, at: Date, scope: Scope): Promise<AutomationProps | null> {
		return await this._.patchOne({
			scope,
			where: { _id: this._.parseId(id), activeRunId: this._.parseId(runId) } as any,
			set: { lastRunStatus: status, lastRunAt: at },
			unset: { activeRunId: '' },
		})
	}

	public async renewLease (id: string, workerId: string, until: Date, scope: Scope): Promise<AutomationProps | null> {
		return await this._.patchOne({
			scope,
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			set: { lockedUntil: until },
		})
	}

	public async release (id: string, workerId: string, result: Pick<AutomationProps, 'lastRunAt' | 'lastRunStatus' | 'activeRunId'>, scope: Scope): Promise<AutomationProps | null> {
		const { activeRunId, lastRunAt, lastRunStatus } = result

		return await this._.patchOne({
			scope,
			where: { _id: this._.parseId(id), lockedBy: workerId } as any,
			set: {
				...(lastRunAt ? { lastRunAt } : {}),
				...(lastRunStatus ? { lastRunStatus } : {}),
				...(activeRunId ? { activeRunId } : {}),
			},
			unset: { lockedBy: '', lockedUntil: '', ...(activeRunId ? {} : { activeRunId: '' }) },
		})
	}

	private unlocked (now: Date) {
		return { $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }] }
	}
}
