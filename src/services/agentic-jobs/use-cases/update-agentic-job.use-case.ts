import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { AgenticJob, AgenticJobProps } from '../entities'
import { AgenticJobRepository } from '../repositories'
import { readJobFields, assertModel } from '../utils/job-fields'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: AgenticJobProps
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobProps
}

@autoInjectable()
export class UpdateAgenticJobUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, payload, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) throw new Error('Payload is required for updating an agentic job')

		const existing = await this.agenticJobRepository?.findById(id)
		if (!existing) throw new Error('Agentic job not found or update failed')

		if (payload.__v !== undefined && payload.__v !== existing.__v) throw new VersionConflictError()

		const changes = readJobFields(payload as Record<string, any>, { complete: false })
		const { modelProvider, modelName, ...rest } = changes

		const provider = modelProvider === undefined ? existing.modelProvider : modelProvider
		const name = modelName === undefined ? existing.modelName : modelName
		assertModel(provider, name)

		const job = AgenticJob.fromJSON({
			...existing,
			...rest,
			modelProvider: provider ?? undefined,
			modelName: name ?? undefined,
			_id: id,
		})

		job.setUpdatedBy(currentUser)

		if (!provider) job.unset(['modelProvider', 'modelName'])

		const schedulingChanged = rest.recurrence !== undefined || rest.timezone !== undefined || rest.enabled !== undefined
		const missingNextRun = job.enabled && !job.nextRunAt

		if (schedulingChanged || missingNextRun) {
			job.scheduleNextRun()
			if (job.enabled && !job.nextRunAt) throw new Error('The date of the recurrence has already passed')
		}

		const result = await this.agenticJobRepository?.update(job, { expectedVersion: existing.__v })
		if (!result) throw new Error('Agentic job not found or update failed')

		return { data: result }
	}
}
