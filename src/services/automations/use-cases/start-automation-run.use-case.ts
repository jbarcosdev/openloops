import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationProps, AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { openRun } from '../utils/open-run'
import { leaseMs as defaultLeaseMs } from '../utils/settings'

export interface Params extends BaseUseCaseParams {
	automationId: string
	workerId: string
	leaseMs?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { automation: AutomationProps, run: AutomationRunProps }
}

@autoInjectable()
export class StartAutomationRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository,
		@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { automationId, workerId } = params
		if (!automationId || !workerId) throw new Error('The automation and the worker are required')

		const now = params.now ?? new Date()
		const existing = await this.automationRepository!.findById(automationId)
		if (!existing) throw new Error('Automation not found')

		const automation = await this.automationRepository!.claimManual({ id: automationId, workerId, now, leaseMs: params.leaseMs ?? defaultLeaseMs() })
		if (!automation) throw new Error('The automation is already running')

		const run = await openRun(this.automationRunRepository!, { automation, trigger: 'manual', status: 'running', workerId, now })
		await this.automationRepository!.setActiveRun(automationId, workerId, String(run._id))

		return { data: { automation, run: run.toJSON() } }
	}
}
