import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export type WorkspaceItemKind = 'note' | 'artifact' | 'tool_output' | 'file' | 'entity' | 'summary'

export interface WorkspaceItemProps extends BaseEntityProps {
	chatId?: string | ObjectId
	taskId?: string | ObjectId
	kind?: WorkspaceItemKind
	name?: string
	description?: string
	content?: any
	size?: number
	source?: string
	truncated?: boolean
	answerId?: string
}

export class WorkspaceItem extends BaseEntity {
	static fromJSON (props: WorkspaceItemProps): WorkspaceItem {
		return new WorkspaceItem(
			props,
			BaseEntity.toObjectId(props.chatId),
			BaseEntity.toObjectId(props.taskId),
			props.kind,
			props.name,
			props.description,
			props.content,
			props.size,
			props.source,
			props.truncated,
			props.answerId,
		)
	}

	constructor (
		private readonly props: WorkspaceItemProps,
		public chatId?: ObjectId,
		public taskId?: ObjectId,
		public kind?: WorkspaceItemKind,
		public name?: string,
		public description?: string,
		public content?: any,
		public size?: number,
		public source?: string,
		public truncated?: boolean,
		public answerId?: string,
	) {
		super(props)
	}

	toJSON (): WorkspaceItemProps {
		return {
			...super.toJSON(),
			chatId: this.chatId,
			taskId: this.taskId,
			kind: this.kind,
			name: this.name,
			description: this.description,
			content: this.content,
			size: this.size,
			source: this.source,
			truncated: this.truncated,
			answerId: this.answerId,
		}
	}

	get scope (): 'task' | 'chat' {
		return this.taskId ? 'task' : 'chat'
	}

	refreshSize (): void {
		if (this.content === undefined) {
			this.size = 0
			return
		}

		this.size = typeof this.content === 'string' ? this.content.length : (JSON.stringify(this.content) ?? '').length
	}
}
