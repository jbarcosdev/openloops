import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { Automation, AutomationPayload, AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'
import { readAutomationFields, assertModel } from '../utils/automation-fields'

export interface Params extends BaseUseCaseParams {
	payload?: AutomationPayload
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps
}

export class CreateAutomationUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRepository = new AutomationRepository()) {
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
			triggers: fields.triggers,
			eventTokenVersion: 1,
			modelProvider: fields.modelProvider ?? undefined,
			modelName: fields.modelName ?? undefined,
		})

		automation.scheduleNextRun()

		const schedule = automation.triggers?.schedule
		if (schedule?.enabled && !schedule.nextRunAt) throw new Error('The date of the recurrence has already passed')

		await this.automationRepository.create(automation, params.scope ?? Scope.canEdit(currentUser))

		return { data: automation.toJSON() }
	}
}
