import { ObjectId } from 'mongodb'
import { AutomationProps, AutomationRun, AutomationRunStatus, AutomationRunTrigger } from '../entities'
import { AutomationRunRepository } from '../repositories'

export interface OpenRunParams {
	automation: AutomationProps
	trigger: AutomationRunTrigger
	status: Extract<AutomationRunStatus, 'queued' | 'running' | 'skipped'>
	workerId?: string
	now: Date
	scheduledFor?: Date
	skipReason?: string
	payload?: string
	idempotencyKey?: string
}

export async function openRun (repository: AutomationRunRepository, params: OpenRunParams): Promise<AutomationRun> {
	const { automation, trigger, status, workerId, now, scheduledFor, skipReason, payload, idempotencyKey } = params

	const run = AutomationRun.fromJSON({
		automationId: automation._id as ObjectId,
		ownerId: automation.ownerId,
		trigger,
		status,
		scheduledFor,
		...(status === 'queued' ? {} : { startedAt: now }),
		...(status === 'skipped' ? { finishedAt: now, skipReason } : {}),
		instructions: automation.instructions,
		modelProvider: automation.modelProvider,
		modelName: automation.modelName,
		workerId,
		payload,
		idempotencyKey,
		createdAt: now,
	})

	await repository.create(run)

	return run
}
