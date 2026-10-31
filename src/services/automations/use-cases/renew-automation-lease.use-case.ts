import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRepository } from '../repositories'
import { leaseMs as defaultLeaseMs } from '../utils/settings'

export interface Params extends BaseUseCaseParams {
	automationId: string
	workerId: string
	leaseMs?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { renewed: boolean }
}

@autoInjectable()
export class RenewAutomationLeaseUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { automationId, workerId } = params
		const now = params.now ?? new Date()
		const until = new Date(now.getTime() + (params.leaseMs ?? defaultLeaseMs()))

		const automation = await this.automationRepository!.renewLease(automationId, workerId, until)

		return { data: { renewed: Boolean(automation) } }
	}
}
