import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRun, AutomationRunError, AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	runId: string
	workerId: string
	status: 'completed' | 'paused' | 'failed'
	error?: AutomationRunError
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps | null
}

@autoInjectable()
export class FinishAutomationRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository,
		@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { runId, workerId, status, error } = params
		const now = params.now ?? new Date()

		const run = await this.automationRunRepository!.findById(runId)
		if (!run) return { data: null }

		const finished = AutomationRun.fromJSON({
			...run,
			status,
			...(status === 'paused' ? {} : { finishedAt: now }),
			...(error ? { error } : {}),
		})

		const saved = await this.automationRunRepository!.update(finished)

		if (run.automationId) {
			await this.automationRepository!.release(String(run.automationId), workerId, {
				lastRunAt: now,
				lastRunStatus: status,
				...(status === 'paused' ? { activeRunId: run._id as any } : {}),
			})
		}

		return { data: saved ?? finished.toJSON() }
	}
}
