import { autoInjectable, inject } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { QueryOptions, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRunProps } from '../entities'
import { AutomationRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	automationId: string
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps[]
	hasMore?: boolean
}

@autoInjectable()
export class ListAutomationRunsByAutomationUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { automationId, options, currentUser } = params
		if (!automationId) throw new Error('Missing automationId')

		const { page = 1, limit = 10, sortBy = { createdAt: -1 } } = options || {}
		const result = await this.automationRunRepository?._.findManyPaginated({
			scope: params.scope ?? Scope.canView(currentUser),
			where: { automationId: new ObjectId(automationId) },
			options: { page, limit, sortBy },
		})

		return { data: result?.items ?? [], hasMore: result?.hasMore ?? false }
	}
}
