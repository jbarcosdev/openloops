import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRepository } from '../repositories'
import { signEventToken } from '../utils/event-token'

export interface Params extends BaseUseCaseParams {
	id: string
	expiresIn?: string | null
}

export interface Output extends BaseUseCaseOutput {
	data: { token: string, expiresAt?: Date }
}

@autoInjectable()
export class IssueAutomationEventTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, expiresIn, currentUser } = params

		const automation = await this.automationRepository?.findById(id)
		if (!automation) throw new Error('Automation not found')

		if (!currentUser?.isAdmin() && String(automation.ownerId) !== currentUser?.userId) this.throwError403()
		if (automation.trigger?.type !== 'event') throw new Error('Only an automation with an event trigger has a token')

		return { data: signEventToken({ automationId: id, tokenVersion: automation.trigger.tokenVersion, expiresIn }) }
	}
}
