import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { getChatById } from '@services/chats'
import { AgenticJobRun, AgenticJobRunProps, AgenticJobRunStatus } from '../entities'
import { AgenticJobRepository, AgenticJobRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	runId: string
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobRunProps | null
}

export const LOST_WORKER_MESSAGE = 'The worker that was running this job was lost before it finished'

@autoInjectable()
export class SyncAgenticJobRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository,
		@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const now = params.now ?? new Date()
		const run = await this.agenticJobRunRepository?.findById(params.runId)

		if (!run) return { data: null }
		if (run.status === 'paused') return { data: await this.syncPaused(run, now) }
		if (run.status === 'running') return { data: await this.syncRunning(run, now) }

		return { data: run }
	}

	private async syncPaused (run: AgenticJobRunProps, now: Date): Promise<AgenticJobRunProps> {
		if (!run.chatId) return run

		const { data: chat } = await getChatById({ id: String(run.chatId) })
		const status = chat?.state?.status

		if (status === 'idle') return await this.settle(run, 'completed', now)
		if (status === 'failed') return await this.settle(run, 'failed', now, { code: chat?.state?.lastError?.code, message: chat?.state?.lastError?.message ?? 'The run failed' })

		return run
	}

	private async syncRunning (run: AgenticJobRunProps, now: Date): Promise<AgenticJobRunProps> {
		const job = run.jobId ? await this.agenticJobRepository?.findById(String(run.jobId)) : null
		const lockedUntil = job?.lockedUntil ? new Date(job.lockedUntil).getTime() : 0

		if (job && lockedUntil > now.getTime()) return run

		return await this.settle(run, 'failed', now, { code: 'WORKER_LOST', message: LOST_WORKER_MESSAGE })
	}

	private async settle (run: AgenticJobRunProps, status: AgenticJobRunStatus, now: Date, error?: { code?: string, message: string }): Promise<AgenticJobRunProps> {
		const updated = AgenticJobRun.fromJSON({ ...run, status, finishedAt: now, ...(error ? { error } : {}) })
		const saved = await this.agenticJobRunRepository?.update(updated)

		if (run.jobId && run._id) await this.agenticJobRepository?.settleRun(String(run.jobId), String(run._id), status, now)

		return saved ?? updated.toJSON()
	}
}
