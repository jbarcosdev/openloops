import { AutomationProps, AutomationRun, AutomationRunProps } from '../entities'
import { AutomationRunRepository } from '../repositories'
import { LOST_WORKER_MESSAGE, SyncAutomationRunUseCase } from '../use-cases/sync-automation-run.use-case'
import { runnerScope } from './runner-scope'

export async function findPausedRun (runs: AutomationRunRepository, syncRun: SyncAutomationRunUseCase, automation: AutomationProps, now: Date): Promise<AutomationRunProps | null> {
	if (!automation.activeRunId) return null

	const previous = await runs.findById(String(automation.activeRunId), runnerScope)
	if (!previous) return null

	if (previous.status === 'running') {
		const lost = AutomationRun.fromJSON({ ...previous, status: 'failed', finishedAt: now, error: { code: 'WORKER_LOST', message: LOST_WORKER_MESSAGE } })
		await runs.update(lost, runnerScope)
		return null
	}

	if (previous.status !== 'paused') return null

	const data = await syncRun.execute({ runId: String(previous._id), now })

	return data?.status === 'paused' ? data : null
}
