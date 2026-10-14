import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobRun, AgenticJobRunError, AgenticJobRunProps } from '../entities'
import { AgenticJobRepository, AgenticJobRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	runId: string
	workerId: string
	status: 'completed' | 'paused' | 'failed'
	error?: AgenticJobRunError
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobRunProps | null
}

@autoInjectable()
export class FinishAgenticJobRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository,
		@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { runId, workerId, status, error } = params
		const now = params.now ?? new Date()

		const run = await this.agenticJobRunRepository!.findById(runId)
		if (!run) return { data: null }

		const finished = AgenticJobRun.fromJSON({
			...run,
			status,
			...(status === 'paused' ? {} : { finishedAt: now }),
			...(error ? { error } : {}),
		})

		const saved = await this.agenticJobRunRepository!.update(finished)

		if (run.jobId) {
			await this.agenticJobRepository!.release(String(run.jobId), workerId, {
				lastRunAt: now,
				lastRunStatus: status,
				...(status === 'paused' ? { activeRunId: run._id as any } : {}),
			})
		}

		return { data: saved ?? finished.toJSON() }
	}
}
