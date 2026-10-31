import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRunProps, AutomationRunStatus } from '../entities'
import { AutomationRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	status?: AutomationRunStatus
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps[]
}

@autoInjectable()
export class ListAutomationRunsByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { status, options, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to list the runs of the automations')

		const { page = 1, limit = 10, sortBy = { createdAt: -1 } } = options || {}
		const results = await this.automationRunRepository?.findByOwner(currentUser.userId, { page, limit, sortBy }, status)

		return { data: results ?? [] }
	}
}
