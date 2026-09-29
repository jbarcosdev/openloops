import { ObjectId } from 'mongodb'
import type { AssistantMessage } from '@mariozechner/pi-ai'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export interface LLMCallProps extends BaseEntityProps {
	taskName?: string
	answerId?: string | ObjectId
	sessionId?: string | ObjectId
	costInUsd?: number
	response?: AssistantMessage
}

export class LLMCall extends BaseEntity {
	static fromJSON (props: LLMCallProps) {
		return new LLMCall(
			props,
			props.taskName || undefined,
			BaseEntity.toObjectId(props.answerId),
			BaseEntity.toObjectId(props.sessionId),
			props.costInUsd ? Number(props.costInUsd) : undefined,
			props.response || undefined,
		)
	}

	constructor (
		private readonly props: LLMCallProps,
		public taskName?: string,
		public answerId?: ObjectId,
		public sessionId?: ObjectId,
		public costInUsd?: number,
		public response?: AssistantMessage,
	) {
		super(props)
	}

	toJSON (): LLMCallProps {
		return {
			...super.toJSON(),
			taskName: this.taskName,
			answerId: this.answerId,
			sessionId: this.sessionId,
			costInUsd: this.costInUsd,
			response: this.response,
		}
	}

	setResponse (response: AssistantMessage) {
		this.response = response
	}

	setTaskName (taskId: string) {
		this.taskName = taskId
	}
}
