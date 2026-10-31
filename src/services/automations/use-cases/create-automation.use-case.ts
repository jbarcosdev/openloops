import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Automation, AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'
import { readAutomationFields, assertModel } from '../utils/automation-fields'

export interface Params extends BaseUseCaseParams {
	payload?: AutomationProps
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps
}

@autoInjectable()
export class CreateAutomationUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to create an automation')

		const fields = readAutomationFields(payload as Record<string, any>, { complete: true })
		assertModel(fields.modelProvider, fields.modelName)

		const automation = Automation.fromJSON({
			name: fields.name,
			instructions: fields.instructions,
			recurrence: fields.recurrence,
			timezone: fields.timezone,
			enabled: fields.enabled ?? true,
			modelProvider: fields.modelProvider ?? undefined,
			modelName: fields.modelName ?? undefined,
		})

		automation.setCreatedBy(currentUser)
		automation.setOwner(currentUser)
		automation.scheduleNextRun()

		if (automation.enabled && !automation.nextRunAt) throw new Error('The date of the recurrence has already passed')

		await this.automationRepository?.create(automation)

		return { data: automation.toJSON() }
	}
}
