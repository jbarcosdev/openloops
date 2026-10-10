import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export interface AgentTraceEntryProps extends BaseEntityProps {
	chatId?: string | ObjectId
	taskId?: string | ObjectId
	node?: string
	reasoning?: string
	timestamp?: Date | string
	answerId?: string | ObjectId
	messageId?: string | ObjectId
	kind?: 'skill' | 'node' | 'agent' | 'guard'
	iteration?: number
	durationMs?: number
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
			BaseEntity.toObjectId(props.answerId),
			BaseEntity.toObjectId(props.messageId),
			props.kind,
			props.iteration,
			props.durationMs,
		)
	}

	constructor (
		private readonly props: AgentTraceEntryProps,
		public chatId?: ObjectId,
		public taskId?: ObjectId,
		public node?: string,
		public reasoning?: string,
		public timestamp?: Date,
		public answerId?: ObjectId,
		public messageId?: ObjectId,
		public kind?: 'skill' | 'node' | 'agent' | 'guard',
		public iteration?: number,
		public durationMs?: number,
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
			answerId: this.answerId,
			messageId: this.messageId,
			kind: this.kind,
			iteration: this.iteration,
			durationMs: this.durationMs,
		}
	}
}
