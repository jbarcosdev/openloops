import { ObjectId } from 'mongodb'
import { AgenticJobProps, AgenticJobRun, AgenticJobRunStatus, AgenticJobRunTrigger } from '../entities'
import { AgenticJobRunRepository } from '../repositories'

export interface OpenRunParams {
	job: AgenticJobProps
	trigger: AgenticJobRunTrigger
	status: Extract<AgenticJobRunStatus, 'running' | 'skipped'>
	workerId: string
	now: Date
	scheduledFor?: Date
	skipReason?: string
}

export async function openRun (repository: AgenticJobRunRepository, params: OpenRunParams): Promise<AgenticJobRun> {
	const { job, trigger, status, workerId, now, scheduledFor, skipReason } = params

	const run = AgenticJobRun.fromJSON({
		jobId: job._id as ObjectId,
		ownerId: job.ownerId,
		trigger,
		status,
		scheduledFor,
		startedAt: now,
		...(status === 'skipped' ? { finishedAt: now, skipReason } : {}),
		instructions: job.instructions,
		modelProvider: job.modelProvider,
		modelName: job.modelName,
		workerId,
		createdAt: now,
	})

	await repository.create(run)

	return run
}
