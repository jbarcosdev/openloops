import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { AutomationRunRepository } from '../repositories'
import { SyncAutomationRunUseCase } from './sync-automation-run.use-case'
import { runnerScope } from '../utils/runner-scope'

const DEFAULT_LIMIT = 100

export interface Params extends BaseUseCaseParams {
	limit?: number
	now?: Date
}

export type Output = { checked: number, settled: number }

export class SyncAutomationRunsUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly automationRunRepository = new AutomationRunRepository(),
		private readonly syncRun = new SyncAutomationRunUseCase(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const limit = params.limit ?? DEFAULT_LIMIT
		const open = [
			...(await this.automationRunRepository.findByStatus('paused', limit, runnerScope) ?? []),
			...(await this.automationRunRepository.findByStatus('running', limit, runnerScope) ?? []),
		]

		let settled = 0

		for (const run of open) {
			const data = await this.syncRun!.execute({ runId: String(run._id), now: params.now })
			if (data && data.status !== run.status) settled++
		}

		return { checked: open.length, settled }
	}
}
