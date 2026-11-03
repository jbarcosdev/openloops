import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps | null
}

@autoInjectable()
export class GetAutomationByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.automationRepository?.findById(id, params.scope ?? Scope.canView(currentUser))

		return { data: result ?? null }
	}
}
