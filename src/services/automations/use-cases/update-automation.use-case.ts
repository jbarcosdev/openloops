import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { Automation, AutomationPayload, AutomationProps } from '../entities'
import { AutomationRepository } from '../repositories'
import { readAutomationFields, assertModel } from '../utils/automation-fields'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: AutomationPayload
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationProps
}

@autoInjectable()
export class UpdateAutomationUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, payload, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) throw new Error('Payload is required for updating an automation')

		const scope = params.scope ?? Scope.canEdit(currentUser)
		const existing = await this.automationRepository?.findById(id, scope)
		if (!existing) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		if (payload.__v !== undefined && payload.__v !== existing.__v) throw new VersionConflictError()

		const changes = readAutomationFields(payload as Record<string, any>, { complete: false, triggers: existing.triggers })
		const { modelProvider, modelName, ...rest } = changes

		const provider = modelProvider === undefined ? existing.modelProvider : modelProvider
		const name = modelName === undefined ? existing.modelName : modelName
		assertModel(provider, name)

		const automation = Automation.fromJSON({
			...existing,
			...rest,
			modelProvider: provider ?? undefined,
			modelName: name ?? undefined,
			_id: id,
		})

		if (!provider) automation.unset(['modelProvider', 'modelName'])

		const removed = (['schedule', 'event'] as const).filter(key => existing.triggers?.[key] && !automation.triggers?.[key])
		if (removed.length) automation.toUnset = Object.fromEntries(removed.map(key => [`triggers.${key}`, '']))
		if (removed.includes('event')) automation.eventTokenVersion = (existing.eventTokenVersion as number) + 1

		const schedule = automation.triggers?.schedule
		const scheduleChanged = payload.triggers?.schedule !== undefined

		if (schedule && (scheduleChanged || (schedule.enabled && !schedule.nextRunAt))) {
			automation.scheduleNextRun()
			if (schedule.enabled && !schedule.nextRunAt) throw new Error('The date of the recurrence has already passed')
		}

		const result = await this.automationRepository?.update(automation, scope, { expectedVersion: existing.__v })
		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
