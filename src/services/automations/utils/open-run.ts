import { ObjectId } from 'mongodb'
import { AutomationProps, AutomationRun, AutomationRunStatus, AutomationRunTrigger } from '../entities'
import { AutomationRunRepository } from '../repositories'

export interface OpenRunParams {
	automation: AutomationProps
	trigger: AutomationRunTrigger
	status: Extract<AutomationRunStatus, 'running' | 'skipped'>
	workerId: string
	now: Date
	scheduledFor?: Date
	skipReason?: string
}

export async function openRun (repository: AutomationRunRepository, params: OpenRunParams): Promise<AutomationRun> {
	const { automation, trigger, status, workerId, now, scheduledFor, skipReason } = params

	const run = AutomationRun.fromJSON({
		automationId: automation._id as ObjectId,
		ownerId: automation.ownerId,
		trigger,
		status,
		scheduledFor,
		startedAt: now,
		...(status === 'skipped' ? { finishedAt: now, skipReason } : {}),
		instructions: automation.instructions,
		modelProvider: automation.modelProvider,
		modelName: automation.modelName,
		workerId,
		createdAt: now,
	})

	await repository.create(run)

	return run
}
