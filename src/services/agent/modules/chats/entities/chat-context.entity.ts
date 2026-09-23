type ContextRecordType = 'message' | 'file' | 'entity' | 'tool_output' | 'artifact' | 'summary'

export interface ContextRecord {
	taskId: string
	meta: {
		name: string
		type: ContextRecordType
		shortDescription: string
	}
	content: any
}

export interface ChatContextProps {
	items?: ContextRecord[]
}

export class ChatContext {
	private readonly MEMORY_CONTEXT_MAX_CHARS = 10_000

	static fromJSON (props: ChatContextProps) {
		return new ChatContext(
			props,
			props.items,
		)
	}

	constructor (
		private readonly props: ChatContextProps,
		public items?: ContextRecord[],
	) {}

	get length (): number {
		return this.items ? JSON.stringify(this.items).length : 0
	}

	get allMeta () {
		return this.items?.map(item => item.meta)
	}

	toJSON (): ChatContextProps {
		return {
			items: this.items,
		}
	}

	addContext (contextRecord) {
		this.items ??= []
		this.items.push(contextRecord)
	}

	selectContext (filters: { taskId: string, name: string }) {
		return this.items?.filter(item => {
			return (filters.taskId === undefined || item.taskId === filters.taskId) &&
			(filters.name === undefined || item.meta.name === filters.name)
		})
	}

	lastContext (filters: { taskId: string, name: string }): ContextRecord | undefined {
		const matches = this.selectContext(filters)
		return matches?.[matches.length - 1]
	}

	compress () {

	}

	pruneContext () {

	}
}
