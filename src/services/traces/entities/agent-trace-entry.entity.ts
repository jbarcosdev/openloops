import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export interface AgentTraceEntryProps extends BaseEntityProps {
	chatId?: string | ObjectId
	taskId?: string | ObjectId
	node?: string
	reasoning?: string
	timestamp?: Date | string
}

export class AgentTraceEntry extends BaseEntity {
	static fromJSON (props: AgentTraceEntryProps): AgentTraceEntry {
		return new AgentTraceEntry(
			props,
			BaseEntity.toObjectId(props.chatId),
			BaseEntity.toObjectId(props.taskId),
			props.node,
			props.reasoning,
			props.timestamp ? new Date(props.timestamp) : undefined,
		)
	}

	constructor (
		private readonly props: AgentTraceEntryProps,
		public chatId?: ObjectId,
		public taskId?: ObjectId,
		public node?: string,
		public reasoning?: string,
		public timestamp?: Date,
	) {
		super(props)
	}

	toJSON (): AgentTraceEntryProps {
		return {
			...super.toJSON(),
			chatId: this.chatId,
			taskId: this.taskId,
			node: this.node,
			reasoning: this.reasoning,
			timestamp: this.timestamp,
		}
	}
}
