import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { AutomationRun, AutomationRunError, AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { runnerScope } from '../utils/runner-scope'

export interface Params extends BaseUseCaseParams {
	runId: string
	workerId: string
	status: 'completed' | 'paused' | 'failed'
	error?: AutomationRunError
	now?: Date
}

export type Output = AutomationRunProps | null

export class FinishAutomationRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly automationRepository = new AutomationRepository(),
		private readonly automationRunRepository = new AutomationRunRepository(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { runId, workerId, status, error } = params
		const now = params.now ?? new Date()

		const run = await this.automationRunRepository!.findById(runId, runnerScope)
		if (!run) return null

		const finished = AutomationRun.fromJSON({
			...run,
			status,
			...(status === 'paused' ? {} : { finishedAt: now }),
			...(error ? { error } : {}),
		})

		const saved = await this.automationRunRepository!.update(finished, runnerScope)

		if (run.automationId) {
			await this.automationRepository!.release(String(run.automationId), workerId, {
				lastRunAt: now,
				lastRunStatus: status,
				...(status === 'paused' ? { activeRunId: run._id as any } : {}),
			}, runnerScope)
		}

		return saved ?? finished.toJSON()
	}
}
