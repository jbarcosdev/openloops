import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AutomationRepository } from '../repositories'
import { signEventToken } from '../utils/event-token'

export interface Params extends BaseUseCaseParams {
	id: string
	expiresIn?: string | null
}

export type Output = { token: string, expiresAt?: Date }

export class IssueAutomationEventTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRepository = new AutomationRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, expiresIn, currentUser } = params

		const automation = await this.automationRepository.findById(id, params.scope ?? Scope.canManage(currentUser))
		if (!automation) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		if (!automation.triggers?.event) throw new Error('Only an automation with an event trigger has a token')

		return signEventToken({ automationId: id, tokenVersion: automation.eventTokenVersion as number, expiresIn })
	}
}
