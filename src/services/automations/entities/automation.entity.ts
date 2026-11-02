import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { AutomationTriggers } from './trigger'
import { computeNextRun } from '../utils/next-run'
import type { AutomationRunStatus } from './automation-run.entity'

export interface AutomationProps extends BaseEntityProps {
	name?: string
	instructions?: string
	triggers?: AutomationTriggers
	eventTokenVersion?: number
	modelProvider?: string
	modelName?: string
	lastRunAt?: string | Date | null
	lastRunStatus?: AutomationRunStatus
	lockedBy?: string | null
	lockedUntil?: string | Date | null
	activeRunId?: string | ObjectId | null
}

const toDate = (value?: string | Date | null): Date | undefined => {
	if (!value) return undefined

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) throw new Error('{{value_must_be_a_date}}')

	return date
}

const readTriggerDates = (triggers?: AutomationTriggers): AutomationTriggers | undefined => {
	if (!triggers?.schedule) return triggers

	const { nextRunAt, ...schedule } = triggers.schedule
	const date = toDate(nextRunAt)

	return { ...triggers, schedule: { ...schedule, ...(date ? { nextRunAt: date } : {}) } }
}

export class Automation extends BaseEntity {
	static fromJSON (props: AutomationProps): Automation {
		return new Automation(
			props,
			props.name || undefined,
			props.instructions || undefined,
			readTriggerDates(props.triggers),
			props.eventTokenVersion,
			props.modelProvider || undefined,
			props.modelName || undefined,
			toDate(props.lastRunAt),
			props.lastRunStatus,
			props.lockedBy || undefined,
			toDate(props.lockedUntil),
			props.activeRunId ? BaseEntity.toObjectId(props.activeRunId) : undefined,
		)
	}

	constructor (
		private readonly props: AutomationProps,
		public name?: string,
		public instructions?: string,
		public triggers?: AutomationTriggers,
		public eventTokenVersion?: number,
		public modelProvider?: string,
		public modelName?: string,
		public lastRunAt?: Date,
		public lastRunStatus?: AutomationRunStatus,
		public lockedBy?: string,
		public lockedUntil?: Date,
		public activeRunId?: ObjectId,
	) {
		super(props)
	}

	toJSON (): AutomationProps {
		return {
			...super.toJSON(),
			name: this.name,
			instructions: this.instructions,
			triggers: this.triggers,
			eventTokenVersion: this.eventTokenVersion,
			modelProvider: this.modelProvider,
			modelName: this.modelName,
			lastRunAt: this.lastRunAt,
			lastRunStatus: this.lastRunStatus,
			lockedBy: this.lockedBy,
			lockedUntil: this.lockedUntil,
			activeRunId: this.activeRunId,
		}
	}

	scheduleNextRun (from: Date = new Date()): this {
		const schedule = this.triggers?.schedule
		if (!schedule) return this

		const next = schedule.enabled ? computeNextRun(schedule.recurrence, schedule.timezone, from) : null

		if (next) {
			schedule.nextRunAt = next
		} else {
			delete schedule.nextRunAt
			this.toUnset = { ...this.toUnset, 'triggers.schedule.nextRunAt': '' }
		}

		return this
	}
}
