import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export type AgenticJobRunStatus = 'running' | 'completed' | 'paused' | 'failed' | 'skipped'

export type AgenticJobRunTrigger = 'schedule' | 'manual'

export interface AgenticJobRunError {
	code?: string
	message: string
}

export interface AgenticJobRunProps extends BaseEntityProps {
	jobId?: string | ObjectId
	chatId?: string | ObjectId
	trigger?: AgenticJobRunTrigger
	status?: AgenticJobRunStatus
	scheduledFor?: string | Date
	startedAt?: string | Date
	finishedAt?: string | Date
	instructions?: string
	modelProvider?: string
	modelName?: string
	error?: AgenticJobRunError
	skipReason?: string
	workerId?: string
}

const toDate = (value?: string | Date): Date | undefined => {
	if (!value) return undefined

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) throw new Error('{{value_must_be_a_date}}')

	return date
}

export class AgenticJobRun extends BaseEntity {
	static fromJSON (props: AgenticJobRunProps): AgenticJobRun {
		return new AgenticJobRun(
			props,
			BaseEntity.toObjectId(props.jobId),
			BaseEntity.toObjectId(props.chatId),
			props.trigger,
			props.status,
			toDate(props.scheduledFor),
			toDate(props.startedAt),
			toDate(props.finishedAt),
			props.instructions || undefined,
			props.modelProvider || undefined,
			props.modelName || undefined,
			props.error,
			props.skipReason || undefined,
			props.workerId || undefined,
		)
	}

	constructor (
		private readonly props: AgenticJobRunProps,
		public jobId?: ObjectId,
		public chatId?: ObjectId,
		public trigger?: AgenticJobRunTrigger,
		public status?: AgenticJobRunStatus,
		public scheduledFor?: Date,
		public startedAt?: Date,
		public finishedAt?: Date,
		public instructions?: string,
		public modelProvider?: string,
		public modelName?: string,
		public error?: AgenticJobRunError,
		public skipReason?: string,
		public workerId?: string,
	) {
		super(props)
	}

	toJSON (): AgenticJobRunProps {
		return {
			...super.toJSON(),
			jobId: this.jobId,
			chatId: this.chatId,
			trigger: this.trigger,
			status: this.status,
			scheduledFor: this.scheduledFor,
			startedAt: this.startedAt,
			finishedAt: this.finishedAt,
			instructions: this.instructions,
			modelProvider: this.modelProvider,
			modelName: this.modelName,
			error: this.error,
			skipReason: this.skipReason,
			workerId: this.workerId,
		}
	}
}
