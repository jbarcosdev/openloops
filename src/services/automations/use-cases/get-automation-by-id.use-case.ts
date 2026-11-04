import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
}

export type Output = AutomationProps | null

export class GetAutomationByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRepository = new AutomationRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.automationRepository.findById(id, params.scope ?? Scope.canView(currentUser))

		return result ?? null
	}
}
