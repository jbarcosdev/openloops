import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

type Roles = 'user' | 'assistant'

export interface ChatMessageProps extends BaseEntityProps {
	role?: Roles
	content?: string
	answerId?: string | ObjectId
	ref?: string
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
			props.ref,
		)
	}

	constructor (
		private readonly props: ChatMessageProps,
		public role?: Roles,
		public content?: string,
		public answerId?: ObjectId,
		public ref?: string,
	) {
		super(props)
	}

	toJSON (): ChatMessageProps {
		return {
			...super.toJSON(),
			role: this.role,
			content: this.content,
			answerId: this.answerId,
			ref: this.ref,
		}
	}
}
