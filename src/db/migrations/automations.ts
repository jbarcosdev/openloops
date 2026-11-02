import { Db } from 'mongodb'
import { ensureIndexes } from '../indexes'

export interface AutomationsMigrationOptions {
	dryRun?: boolean
}

export interface AutomationsMigrationReport {
	dryRun: boolean
	renamedCollections: string[]
	triggersCreated: number
	triggersMoved: number
	runsUpdated: number
	droppedIndexes: string[]
}

const RENAMES: [string, string][] = [
	['agentic_jobs', 'automations'],
	['agentic_job_runs', 'automation_runs'],
]

const OLD_RUN_INDEX = 'jobId_1_createdAt_-1'
const OLD_AUTOMATION_INDEX = 'enabled_1_nextRunAt_1'

const exists = async (db: Db, name: string): Promise<boolean> => (await db.listCollections({ name }).toArray()).length > 0

export async function migrateAutomations (db: Db, options: AutomationsMigrationOptions = {}): Promise<AutomationsMigrationReport> {
	const dryRun = Boolean(options.dryRun)
	const report: AutomationsMigrationReport = { dryRun, renamedCollections: [], triggersCreated: 0, triggersMoved: 0, runsUpdated: 0, droppedIndexes: [] }

	for (const [from, to] of RENAMES) {
		if (!await exists(db, from)) continue
		if (await exists(db, to)) throw new Error(`Cannot rename ${from} to ${to} because ${to} already exists`)

		if (!dryRun) await db.renameCollection(from, to)
		report.renamedCollections.push(`${from} -> ${to}`)
	}

	const automations = db.collection(dryRun && report.renamedCollections.length ? 'agentic_jobs' : 'automations')
	const runs = db.collection(dryRun && report.renamedCollections.length ? 'agentic_job_runs' : 'automation_runs')

	const withoutTrigger = { trigger: { $exists: false }, recurrence: { $exists: true } }
	const withTrigger = { trigger: { $exists: true } }
	const withJobId = { jobId: { $exists: true } }

	if (dryRun) {
		report.triggersCreated = await automations.countDocuments(withoutTrigger)
		report.triggersMoved = await automations.countDocuments(withTrigger) + report.triggersCreated
		report.runsUpdated = await runs.countDocuments(withJobId)
	} else {
		const triggers = await automations.updateMany(withoutTrigger, [
			{ $set: { trigger: { type: 'schedule', recurrence: '$recurrence', timezone: '$timezone' } } },
			{ $unset: ['recurrence', 'timezone'] },
		])
		const split = await automations.updateMany(withTrigger, [
			{
				$set: {
					triggers: {
						$cond: [
							{ $eq: ['$trigger.type', 'schedule'] },
							{
								schedule: {
									$mergeObjects: [
										{ enabled: { $ifNull: ['$enabled', true] }, recurrence: '$trigger.recurrence', timezone: '$trigger.timezone' },
										{ $cond: [{ $ifNull: ['$nextRunAt', false] }, { nextRunAt: '$nextRunAt' }, {}] },
									],
								},
							},
							{ event: { enabled: { $ifNull: ['$enabled', true] } } },
						],
					},
					eventTokenVersion: { $ifNull: ['$trigger.tokenVersion', 1] },
				},
			},
			{ $unset: ['trigger', 'enabled', 'nextRunAt'] },
		])
		const moved = await runs.updateMany(withJobId, [
			{ $set: { automationId: '$jobId' } },
			{ $unset: 'jobId' },
		])

		report.triggersCreated = triggers.modifiedCount
		report.triggersMoved = split.modifiedCount
		report.runsUpdated = moved.modifiedCount
	}

	for (const [collection, name] of [[runs, OLD_RUN_INDEX], [automations, OLD_AUTOMATION_INDEX]] as const) {
		const indexes = await collection.indexes().catch(() => [])
		if (!indexes.some(index => index.name === name)) continue

		if (!dryRun) await collection.dropIndex(name)
		report.droppedIndexes.push(name)
	}

	if (!dryRun) await ensureIndexes(db)

	return report
}
