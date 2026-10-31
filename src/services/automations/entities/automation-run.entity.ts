import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export type AutomationRunStatus = 'running' | 'completed' | 'paused' | 'failed' | 'skipped'

export type AutomationRunTrigger = 'schedule' | 'manual'

export interface AutomationRunError {
	code?: string
	message: string
}

export interface AutomationRunProps extends BaseEntityProps {
	automationId?: string | ObjectId
	chatId?: string | ObjectId
	trigger?: AutomationRunTrigger
	status?: AutomationRunStatus
	scheduledFor?: string | Date
	startedAt?: string | Date
	finishedAt?: string | Date
	instructions?: string
	modelProvider?: string
	modelName?: string
	error?: AutomationRunError
	skipReason?: string
	workerId?: string
}

const toDate = (value?: string | Date): Date | undefined => {
	if (!value) return undefined

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) throw new Error('{{value_must_be_a_date}}')

	return date
}

export class AutomationRun extends BaseEntity {
	static fromJSON (props: AutomationRunProps): AutomationRun {
		return new AutomationRun(
			props,
			BaseEntity.toObjectId(props.automationId),
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
		private readonly props: AutomationRunProps,
		public automationId?: ObjectId,
		public chatId?: ObjectId,
		public trigger?: AutomationRunTrigger,
		public status?: AutomationRunStatus,
		public scheduledFor?: Date,
		public startedAt?: Date,
		public finishedAt?: Date,
		public instructions?: string,
		public modelProvider?: string,
		public modelName?: string,
		public error?: AutomationRunError,
		public skipReason?: string,
		public workerId?: string,
	) {
		super(props)
	}

	toJSON (): AutomationRunProps {
		return {
			...super.toJSON(),
			automationId: this.automationId,
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
