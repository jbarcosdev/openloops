import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRunRepository } from '../repositories'
import { SyncAutomationRunUseCase } from './sync-automation-run.use-case'

const DEFAULT_LIMIT = 100

export interface Params extends BaseUseCaseParams {
	limit?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { checked: number, settled: number }
}

@autoInjectable()
export class SyncAutomationRunsUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository,
		@inject(SyncAutomationRunUseCase) private readonly syncRun?: SyncAutomationRunUseCase,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const limit = params.limit ?? DEFAULT_LIMIT
		const open = [
			...(await this.automationRunRepository?.findByStatus('paused', limit) ?? []),
			...(await this.automationRunRepository?.findByStatus('running', limit) ?? []),
		]

		let settled = 0

		for (const run of open) {
			const { data } = await this.syncRun!.execute({ runId: String(run._id), now: params.now })
			if (data && data.status !== run.status) settled++
		}

		return { data: { checked: open.length, settled } }
	}
}
