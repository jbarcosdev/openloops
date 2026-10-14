import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobRunRepository } from '../repositories'
import { SyncAgenticJobRunUseCase } from './sync-agentic-job-run.use-case'

const DEFAULT_LIMIT = 100

export interface Params extends BaseUseCaseParams {
	limit?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { checked: number, settled: number }
}

@autoInjectable()
export class SyncAgenticJobRunsUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository,
		@inject(SyncAgenticJobRunUseCase) private readonly syncRun?: SyncAgenticJobRunUseCase,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const limit = params.limit ?? DEFAULT_LIMIT
		const open = [
			...(await this.agenticJobRunRepository?.findByStatus('paused', limit) ?? []),
			...(await this.agenticJobRunRepository?.findByStatus('running', limit) ?? []),
		]

		let settled = 0

		for (const run of open) {
			const { data } = await this.syncRun!.execute({ runId: String(run._id), now: params.now })
			if (data && data.status !== run.status) settled++
		}

		return { data: { checked: open.length, settled } }
	}
}
