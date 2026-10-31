import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
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
		const { id } = params
		const result = await this.automationRepository?.findById(id)

		return { data: result ?? null }
	}
}
