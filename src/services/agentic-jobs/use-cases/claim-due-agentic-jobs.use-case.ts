import { autoInjectable, inject } from 'tsyringe'
import { Logger } from '@common/logger'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobProps, AgenticJobRun, AgenticJobRunProps } from '../entities'
import { AgenticJobRepository, AgenticJobRunRepository } from '../repositories'
import { computeNextRun } from '../utils/next-run'
import { openRun } from '../utils/open-run'
import { leaseMs as defaultLeaseMs } from '../utils/settings'
import { SyncAgenticJobRunUseCase, LOST_WORKER_MESSAGE } from './sync-agentic-job-run.use-case'

const DEFAULT_LIMIT = 10

export interface Params extends BaseUseCaseParams {
	workerId: string
	limit?: number
	leaseMs?: number
	now?: Date
}

export interface ClaimedRun {
	job: AgenticJobProps
	run: AgenticJobRunProps
}

export interface Output extends BaseUseCaseOutput {
	data: { claimed: ClaimedRun[], skipped: AgenticJobRunProps[] }
}

@autoInjectable()
export class ClaimDueAgenticJobsUseCase extends BaseUseCase<Params, Output> {
	private readonly log = new Logger()

	constructor (
		@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository,
		@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository,
		@inject(SyncAgenticJobRunUseCase) private readonly syncRun?: SyncAgenticJobRunUseCase,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { workerId } = params
		if (!workerId) throw new Error('The id of the worker is required')

		const now = params.now ?? new Date()
		const leaseMs = params.leaseMs ?? defaultLeaseMs()
		const due = await this.agenticJobRepository!.findDue(now, params.limit ?? DEFAULT_LIMIT)

		const claimed: ClaimedRun[] = []
		const skipped: AgenticJobRunProps[] = []

		for (const candidate of due) {
			const id = String(candidate._id)
			const scheduledFor = candidate.nextRunAt ? new Date(candidate.nextRunAt) : undefined

			let nextRunAt: Date | null = null

			try {
				nextRunAt = computeNextRun(candidate.recurrence!, candidate.timezone!, now)
			} catch (error: any) {
				this.log.error({ error: error?.message ?? error, jobId: id }, '[AGENTIC JOBS] The recurrence of a job cannot be calculated, skipping it')
				continue
			}

			const job = await this.agenticJobRepository!.claim({ id, workerId, now, leaseMs, nextRunAt: nextRunAt ?? undefined })
			if (!job) continue

			const pending = await this.previousRun(job, now)

			if (pending) {
				const run = await openRun(this.agenticJobRunRepository!, { job, trigger: 'schedule', status: 'skipped', workerId, now, scheduledFor, skipReason: 'The previous run is still waiting for the user' })
				await this.agenticJobRepository!.release(id, workerId, { activeRunId: pending._id as any })
				skipped.push(run.toJSON())
				continue
			}

			const run = await openRun(this.agenticJobRunRepository!, { job, trigger: 'schedule', status: 'running', workerId, now, scheduledFor })
			await this.agenticJobRepository!.setActiveRun(id, workerId, String(run._id))
			claimed.push({ job, run: run.toJSON() })
		}

		return { data: { claimed, skipped } }
	}

	private async previousRun (job: AgenticJobProps, now: Date): Promise<AgenticJobRunProps | null> {
		if (!job.activeRunId) return null

		const previous = await this.agenticJobRunRepository!.findById(String(job.activeRunId))
		if (!previous) return null

		if (previous.status === 'running') {
			const lost = AgenticJobRun.fromJSON({ ...previous, status: 'failed', finishedAt: now, error: { code: 'WORKER_LOST', message: LOST_WORKER_MESSAGE } })
			await this.agenticJobRunRepository!.update(lost)
			return null
		}

		if (previous.status !== 'paused') return null

		const { data } = await this.syncRun!.execute({ runId: String(previous._id), now })

		return data?.status === 'paused' ? data : null
	}
}
