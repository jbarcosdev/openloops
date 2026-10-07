import { ObjectId } from 'mongodb'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export interface LLMCallProps extends BaseEntityProps {
	origin?: string
	answerId?: string | ObjectId
	sessionId?: string | ObjectId
	costInUsd?: number
	response?: AssistantMessage
}

export class LLMCall extends BaseEntity {
	static fromJSON (props: LLMCallProps) {
		return new LLMCall(
			props,
			props.origin || undefined,
			BaseEntity.toObjectId(props.answerId),
			BaseEntity.toObjectId(props.sessionId),
			props.costInUsd ? Number(props.costInUsd) : undefined,
			props.response || undefined,
		)
	}

	constructor (
		private readonly props: LLMCallProps,
		public origin?: string,
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
			origin: this.origin,
			answerId: this.answerId,
			sessionId: this.sessionId,
			costInUsd: this.costInUsd,
			response: this.response,
		}
	}

	setResponse (response: AssistantMessage) {
		this.response = response
	}

	setOrigin (origin: string) {
		this.origin = origin
	}
}
