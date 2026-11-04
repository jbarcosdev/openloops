import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationProps, AutomationRunProps } from '../entities'
import { AutomationRepository, AutomationRunRepository } from '../repositories'
import { openRun } from '../utils/open-run'
import { leaseMs as defaultLeaseMs } from '../utils/settings'
import { runnerScope } from '../utils/runner-scope'
import { Scope } from '@common/repositories'

export interface Params extends BaseUseCaseParams {
	automationId: string
	workerId: string
	leaseMs?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { automation: AutomationProps, run: AutomationRunProps }
}

export class StartAutomationRunUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly automationRepository = new AutomationRepository(),
		private readonly automationRunRepository = new AutomationRunRepository(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { automationId, workerId, currentUser } = params
		if (!automationId || !workerId) throw new Error('The automation and the worker are required')

		const now = params.now ?? new Date()
		const existing = await this.automationRepository!.findById(automationId, params.scope ?? Scope.canEdit(currentUser))
		if (!existing) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		const automation = await this.automationRepository!.claimManual({ id: automationId, workerId, now, leaseMs: params.leaseMs ?? defaultLeaseMs() }, runnerScope)
		if (!automation) throw new Error('The automation is already running')

		const run = await openRun(this.automationRunRepository!, { scope: runnerScope, automation, trigger: 'manual', status: 'running', workerId, now })
		await this.automationRepository!.setActiveRun(automationId, workerId, String(run._id), runnerScope)

		return { data: { automation, run: run.toJSON() } }
	}
}
