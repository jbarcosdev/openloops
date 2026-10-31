import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Automation, AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps
}

@autoInjectable()
export class RotateAutomationEventTokensUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params

		const existing = await this.automationRepository?.findById(id)
		if (!existing) throw new Error('Automation not found')

		if (!currentUser?.isAdmin() && String(existing.ownerId) !== currentUser?.userId) this.throwError403()
		if (existing.trigger?.type !== 'event') throw new Error('Only an automation with an event trigger has tokens')

		const automation = Automation.fromJSON({ ...existing, trigger: { ...existing.trigger, tokenVersion: existing.trigger.tokenVersion + 1 } })
		automation.setUpdatedBy(currentUser)

		const result = await this.automationRepository?.update(automation, { expectedVersion: existing.__v as number })
		if (!result) throw new Error('Automation not found or update failed')

		return { data: result }
	}
}
