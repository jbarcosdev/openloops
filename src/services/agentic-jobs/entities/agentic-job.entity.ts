import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { Recurrence } from './recurrence'
import { computeNextRun } from '../utils/next-run'
import type { AgenticJobRunStatus } from './agentic-job-run.entity'

export interface AgenticJobProps extends BaseEntityProps {
	name?: string
	instructions?: string
	enabled?: boolean
	recurrence?: Recurrence
	timezone?: string
	modelProvider?: string
	modelName?: string
	nextRunAt?: string | Date | null
	lastRunAt?: string | Date | null
	lastRunStatus?: AgenticJobRunStatus
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

export class AgenticJob extends BaseEntity {
	static fromJSON (props: AgenticJobProps): AgenticJob {
		return new AgenticJob(
			props,
			props.name || undefined,
			props.instructions || undefined,
			props.enabled,
			props.recurrence,
			props.timezone || undefined,
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
		private readonly props: AgenticJobProps,
		public name?: string,
		public instructions?: string,
		public enabled?: boolean,
		public recurrence?: Recurrence,
		public timezone?: string,
		public modelProvider?: string,
		public modelName?: string,
		public nextRunAt?: Date,
		public lastRunAt?: Date,
		public lastRunStatus?: AgenticJobRunStatus,
		public lockedBy?: string,
		public lockedUntil?: Date,
		public activeRunId?: ObjectId,
	) {
		super(props)
	}

	toJSON (): AgenticJobProps {
		return {
			...super.toJSON(),
			name: this.name,
			instructions: this.instructions,
			enabled: this.enabled,
			recurrence: this.recurrence,
			timezone: this.timezone,
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

	scheduleNextRun (from: Date = new Date()): this {
		const next = this.enabled && this.recurrence && this.timezone ? computeNextRun(this.recurrence, this.timezone, from) : null

		if (next) {
			this.nextRunAt = next
		} else {
			this.unset(['nextRunAt'])
		}

		return this
	}
}
