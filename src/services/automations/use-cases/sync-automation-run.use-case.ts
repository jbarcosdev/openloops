import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { getChatById } from '@services/chats'
import { AutomationRun, AutomationRunProps, AutomationRunStatus } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { runnerScope } from '../utils/runner-scope'

export interface Params extends BaseUseCaseParams {
	runId: string
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps | null
}

export const LOST_WORKER_MESSAGE = 'The worker that was running this automation was lost before it finished'

export class SyncAutomationRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly automationRepository = new AutomationRepository(),
		private readonly automationRunRepository = new AutomationRunRepository(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const now = params.now ?? new Date()
		const run = await this.automationRunRepository.findById(params.runId, runnerScope)

		if (!run) return { data: null }
		if (run.status === 'paused') return { data: await this.syncPaused(run, now) }
		if (run.status === 'running') return { data: await this.syncRunning(run, now) }

		return { data: run }
	}

	private async syncPaused (run: AutomationRunProps, now: Date): Promise<AutomationRunProps> {
		if (!run.chatId) return run

		const { data: chat } = await getChatById({ id: String(run.chatId), scope: runnerScope })
		const status = chat?.state?.status

		if (status === 'idle') return await this.settle(run, 'completed', now)
		if (status === 'failed') return await this.settle(run, 'failed', now, { code: chat?.state?.lastError?.code, message: chat?.state?.lastError?.message ?? 'The run failed' })

		return run
	}

	private async syncRunning (run: AutomationRunProps, now: Date): Promise<AutomationRunProps> {
		const automation = run.automationId ? await this.automationRepository.findById(String(run.automationId), runnerScope) : null
		const lockedUntil = automation?.lockedUntil ? new Date(automation.lockedUntil).getTime() : 0

		if (automation && lockedUntil > now.getTime()) return run

		return await this.settle(run, 'failed', now, { code: 'WORKER_LOST', message: LOST_WORKER_MESSAGE })
	}

	private async settle (run: AutomationRunProps, status: AutomationRunStatus, now: Date, error?: { code?: string, message: string }): Promise<AutomationRunProps> {
		const updated = AutomationRun.fromJSON({ ...run, status, finishedAt: now, ...(error ? { error } : {}) })
		const saved = await this.automationRunRepository.update(updated, runnerScope)

		if (run.automationId && run._id) await this.automationRepository.settleRun(String(run.automationId), String(run._id), status, now, runnerScope)

		return saved ?? updated.toJSON()
	}
}
