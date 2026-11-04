import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { Automation, AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps
}

export class RotateAutomationEventTokensUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRepository = new AutomationRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params

		const scope = params.scope ?? Scope.canManage(currentUser)
		const existing = await this.automationRepository.findById(id, scope)
		if (!existing) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		if (!existing.triggers?.event) throw new Error('Only an automation with an event trigger has tokens')

		const automation = Automation.fromJSON({ ...existing, eventTokenVersion: (existing.eventTokenVersion as number) + 1 })
		const result = await this.automationRepository.update(automation, scope, { expectedVersion: existing.__v as number })
		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
