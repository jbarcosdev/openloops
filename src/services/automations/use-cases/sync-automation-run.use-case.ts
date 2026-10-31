import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { getChatById } from '@services/chats'
import { AutomationRun, AutomationRunProps, AutomationRunStatus } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	runId: string
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps | null
}

export const LOST_WORKER_MESSAGE = 'The worker that was running this automation was lost before it finished'

@autoInjectable()
export class SyncAutomationRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository,
		@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const now = params.now ?? new Date()
		const run = await this.automationRunRepository?.findById(params.runId)

		if (!run) return { data: null }
		if (run.status === 'paused') return { data: await this.syncPaused(run, now) }
		if (run.status === 'running') return { data: await this.syncRunning(run, now) }

		return { data: run }
	}

	private async syncPaused (run: AutomationRunProps, now: Date): Promise<AutomationRunProps> {
		if (!run.chatId) return run

		const { data: chat } = await getChatById({ id: String(run.chatId) })
		const status = chat?.state?.status

		if (status === 'idle') return await this.settle(run, 'completed', now)
		if (status === 'failed') return await this.settle(run, 'failed', now, { code: chat?.state?.lastError?.code, message: chat?.state?.lastError?.message ?? 'The run failed' })

		return run
	}

	private async syncRunning (run: AutomationRunProps, now: Date): Promise<AutomationRunProps> {
		const automation = run.automationId ? await this.automationRepository?.findById(String(run.automationId)) : null
		const lockedUntil = automation?.lockedUntil ? new Date(automation.lockedUntil).getTime() : 0

		if (automation && lockedUntil > now.getTime()) return run

		return await this.settle(run, 'failed', now, { code: 'WORKER_LOST', message: LOST_WORKER_MESSAGE })
	}

	private async settle (run: AutomationRunProps, status: AutomationRunStatus, now: Date, error?: { code?: string, message: string }): Promise<AutomationRunProps> {
		const updated = AutomationRun.fromJSON({ ...run, status, finishedAt: now, ...(error ? { error } : {}) })
		const saved = await this.automationRunRepository?.update(updated)

		if (run.automationId && run._id) await this.automationRepository?.settleRun(String(run.automationId), String(run._id), status, now)

		return saved ?? updated.toJSON()
	}
}
