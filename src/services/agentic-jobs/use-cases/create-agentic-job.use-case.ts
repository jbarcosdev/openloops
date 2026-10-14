import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJob, AgenticJobProps } from '../entities'
import { AgenticJobRepository } from '../repositories'
import { readJobFields, assertModel } from '../utils/job-fields'

export interface Params extends BaseUseCaseParams {
	payload?: AgenticJobProps
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobProps
}

@autoInjectable()
export class CreateAgenticJobUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to create an agentic job')

		const fields = readJobFields(payload as Record<string, any>, { complete: true })
		assertModel(fields.modelProvider, fields.modelName)

		const job = AgenticJob.fromJSON({
			name: fields.name,
			instructions: fields.instructions,
			recurrence: fields.recurrence,
			timezone: fields.timezone,
			enabled: fields.enabled ?? true,
			modelProvider: fields.modelProvider ?? undefined,
			modelName: fields.modelName ?? undefined,
		})

		job.setCreatedBy(currentUser)
		job.setOwner(currentUser)
		job.scheduleNextRun()

		if (job.enabled && !job.nextRunAt) throw new Error('The date of the recurrence has already passed')

		await this.agenticJobRepository?.create(job)

		return { data: job.toJSON() }
	}
}
