import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

type Roles = 'user' | 'assistant'

export type MessageSource = 'user' | 'model' | 'harness'

export interface ChatMessageProps extends BaseEntityProps {
	role?: Roles
	content?: string
	answerId?: string | ObjectId
	excludeFromContext?: boolean
	source?: MessageSource
}

export class ChatMessage extends BaseEntity {
	static factory (message: ChatMessageProps) {
		const messageId = message._id && ObjectId.isValid(message._id)
			? new ObjectId(message._id)
			: new ObjectId()

		return ChatMessage.fromJSON({ ...message, _id: messageId })
	}

	static fromJSON (props: ChatMessageProps) {
		return new ChatMessage(
			props,
			props.role,
			props.content,
			BaseEntity.toObjectId(props.answerId),
			props.excludeFromContext,
			props.source,
		)
	}

	constructor (
		private readonly props: ChatMessageProps,
		public role?: Roles,
		public content?: string,
		public answerId?: ObjectId,
		public excludeFromContext?: boolean,
		public source?: MessageSource,
	) {
		super(props)
	}

	toJSON (): ChatMessageProps {
		return {
			...super.toJSON(),
			role: this.role,
			content: this.content,
			answerId: this.answerId,
			excludeFromContext: this.excludeFromContext || undefined,
			source: this.source,
		}
	}
}
