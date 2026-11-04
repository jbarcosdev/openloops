import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { AutomationRepository } from '../repositories'
import { leaseMs as defaultLeaseMs } from '../utils/settings'
import { runnerScope } from '../utils/runner-scope'

export interface Params extends BaseUseCaseParams {
	automationId: string
	workerId: string
	leaseMs?: number
	now?: Date
}

export type Output = { renewed: boolean }

export class RenewAutomationLeaseUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRepository = new AutomationRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { automationId, workerId } = params
		const now = params.now ?? new Date()
		const until = new Date(now.getTime() + (params.leaseMs ?? defaultLeaseMs()))

		const automation = await this.automationRepository!.renewLease(automationId, workerId, until, runnerScope)

		return { renewed: Boolean(automation) }
	}
}
