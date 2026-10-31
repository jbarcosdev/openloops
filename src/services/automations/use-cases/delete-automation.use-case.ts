import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Automation, AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps | null | undefined
}

@autoInjectable()
export class DeleteAutomationUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			if (!currentUser?.isAdmin()) this.throwError403()

			const result = await this.automationRepository?.deleteById(id)
			return { data: { deletedCount: result } as any }
		}

		const automation = Automation.fromJSON({ _id: id })
		automation.setDeletedBy(currentUser)
		automation.unset(['nextRunAt'])

		const result = await this.automationRepository?.update(automation)

		return { data: result }
	}
}
