import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { AutomationTrigger } from './trigger'
import { computeNextRun } from '../utils/next-run'
import type { AutomationRunStatus } from './automation-run.entity'

export interface AutomationProps extends BaseEntityProps {
	name?: string
	instructions?: string
	enabled?: boolean
	trigger?: AutomationTrigger
	modelProvider?: string
	modelName?: string
	nextRunAt?: string | Date | null
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

export class Automation extends BaseEntity {
	static fromJSON (props: AutomationProps): Automation {
		return new Automation(
			props,
			props.name || undefined,
			props.instructions || undefined,
			props.enabled,
			props.trigger,
			props.modelProvider || undefined,
			props.modelName || undefined,
			toDate(props.nextRunAt),
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
		public enabled?: boolean,
		public trigger?: AutomationTrigger,
		public modelProvider?: string,
		public modelName?: string,
		public nextRunAt?: Date,
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
			enabled: this.enabled,
			trigger: this.trigger,
			modelProvider: this.modelProvider,
			modelName: this.modelName,
			nextRunAt: this.nextRunAt,
			lastRunAt: this.lastRunAt,
			lastRunStatus: this.lastRunStatus,
			lockedBy: this.lockedBy,
			lockedUntil: this.lockedUntil,
			activeRunId: this.activeRunId,
		}
	}

	isScheduled (): boolean {
		return this.trigger?.type === 'schedule'
	}

	scheduleNextRun (from: Date = new Date()): this {
		const trigger = this.trigger
		const next = this.enabled && trigger?.type === 'schedule' ? computeNextRun(trigger.recurrence, trigger.timezone, from) : null

		if (next) {
			this.nextRunAt = next
		} else {
			this.unset(['nextRunAt'])
		}

		return this
	}
}
