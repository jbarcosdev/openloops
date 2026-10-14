import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobProps, AgenticJobRunProps } from '../entities'
import { AgenticJobRepository, AgenticJobRunRepository } from '../repositories'
import { openRun } from '../utils/open-run'
import { leaseMs as defaultLeaseMs } from '../utils/settings'

export interface Params extends BaseUseCaseParams {
	jobId: string
	workerId: string
	leaseMs?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { job: AgenticJobProps, run: AgenticJobRunProps }
}

@autoInjectable()
export class StartAgenticJobRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository,
		@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { jobId, workerId } = params
		if (!jobId || !workerId) throw new Error('The job and the worker are required')

		const now = params.now ?? new Date()
		const existing = await this.agenticJobRepository!.findById(jobId)
		if (!existing) throw new Error('Agentic job not found')

		const job = await this.agenticJobRepository!.claimManual({ id: jobId, workerId, now, leaseMs: params.leaseMs ?? defaultLeaseMs() })
		if (!job) throw new Error('The agentic job is already running')

		const run = await openRun(this.agenticJobRunRepository!, { job, trigger: 'manual', status: 'running', workerId, now })
		await this.agenticJobRepository!.setActiveRun(jobId, workerId, String(run._id))

		return { data: { job, run: run.toJSON() } }
	}
}
