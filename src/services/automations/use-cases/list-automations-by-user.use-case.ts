import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps[]
}

@autoInjectable()
export class ListAutomationsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { options, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to list the automations')

		const { page = 1, limit = 10, sortBy = { createdAt: -1 } } = options || {}
		const results = await this.automationRepository?.findByOwner(currentUser.userId, { page, limit, sortBy })

		return { data: results ?? [] }
	}
}
