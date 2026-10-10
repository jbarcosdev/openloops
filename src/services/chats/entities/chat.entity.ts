import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { AgentStateProps, AgentState } from '@harness/agent-state'
import { AgentTask, TaskStatus } from '@services/tasks/entities/agent-task.entity'
import { ChatMessage, ChatMessageProps } from './chat-message.entity'
import { ChatSettings, ChatSettingsProps } from './chat-settings.entity'

export interface ChatProps extends BaseEntityProps {
	state?: AgentStateProps
	settings?: ChatSettingsProps
	messages?: ChatMessageProps[]
}

export interface AgentTrace {
	node: string
	reasoning?: string
	taskId?: string
	timestamp?: Date | string
	kind?: 'skill' | 'node' | 'agent' | 'guard'
	iteration?: number
	durationMs?: number
}

export class Chat extends BaseEntity {
	static withDefaults (loopName?: string): Chat {
		const agentState = new AgentState()
		agentState.cleanContext()

		return Chat.fromJSON({
			state: agentState.toJSON(),
			settings: { loopName },
		})
	}

	static fromJSON (props: ChatProps) {
		return new Chat(
			props,
			props.state && AgentState.fromJSON(props.state),
			props.settings && ChatSettings.fromJSON(props.settings),
			props.messages?.map(message => ChatMessage.factory(message)),
		)
	}

	public tasks: AgentTask[] = []
	private pendingTraces: AgentTrace[] = []

	constructor (
		private readonly props: ChatProps,
		public state?: AgentState,
		public settings?: ChatSettings,
		public messages?: ChatMessage[],
	) {
		super(props)
	}

	get lastAnswer () {
		return this.messages?.slice().reverse().find(message => message.role === 'assistant' && !message.excludeFromContext)?.content
	}

	get activeTask (): AgentTask | undefined {
		if (!this.state?.activeTaskId) return undefined
		return this.tasks.find(t => t.id === this.state?.activeTaskId)
	}

	public toJSON (): ChatProps {
		return {
			...super.toJSON(),
			state: this.state?.toJSON(),
			settings: this.settings?.toJSON(),
			messages: this.messages?.map(message => message.toJSON()),
		}
	}

	public pushMessage (message: ChatMessageProps): ChatMessage {
		this.messages ??= []
		const created = ChatMessage.factory(message)
		this.messages.push(created)
		return created
	}

	public lastHistoryMessages (count = 6) {
		return this.messages?.filter(message => !message.excludeFromContext).slice(-count, -1)
	}

	public addTrace (entry: Omit<AgentTrace, 'timestamp'>): void {
		this.pendingTraces.push({
			...entry,
			taskId: entry.taskId ?? this.activeTask?.id,
			timestamp: new Date(),
		})
	}

	public drainTraces (): AgentTrace[] {
		const traces = this.pendingTraces
		this.pendingTraces = []
		return traces
	}

	public setAgentState (contextState: AgentStateProps) {
		this.state = AgentState.fromJSON(contextState)
	}

	getTask (taskId: string): AgentTask | undefined {
		return this.tasks.find(t => t.id === taskId)
	}

	lastCompletedTask (): AgentTask | undefined {
		return this.tasks.slice().reverse().find(t => t.status === TaskStatus.COMPLETED && t.loopName === this.settings?.loopName)
	}

	createTask (goal: string, opts?: { continuesFrom?: string }): AgentTask {
		if (this.activeTask?.status === TaskStatus.IN_PROGRESS) {
			this.activeTask.pause()
		}

		const continuesFromTask = opts?.continuesFrom ? this.getTask(opts.continuesFrom) : undefined

		const newTask = AgentTask.factory({
			chatId: this._id,
			goal,
			threadId: continuesFromTask?.threadId,
			previousTaskId: opts?.continuesFrom,
			loopName: this.settings?.loopName,
		})

		newTask.threadId ??= newTask._id

		this.tasks.push(newTask)
		this.state?.setActiveTaskId(newTask.id)

		return newTask
	}

	reopenTask (taskId: string): AgentTask | undefined {
		const task = this.getTask(taskId)
		if (!task) return undefined

		task.reopen()
		this.state?.setActiveTaskId(task.id)

		return task
	}

	completeTask (taskId?: string, summary?: string): void {
		const task = taskId ? this.getTask(taskId) : this.activeTask
		task?.complete(summary)
		this.clearActiveTaskIdIfMatches(task)
	}

	failTask (taskId?: string): void {
		const task = taskId ? this.getTask(taskId) : this.activeTask
		task?.fail()
		this.clearActiveTaskIdIfMatches(task)
	}

	cancelTask (taskId?: string): void {
		const task = taskId ? this.getTask(taskId) : this.activeTask
		task?.cancel()
		this.clearActiveTaskIdIfMatches(task)
	}

	private clearActiveTaskIdIfMatches (task?: AgentTask): void {
		if (task?.id === this.state?.activeTaskId) {
			this.state?.setActiveTaskId(undefined)
			this.unset(['state.activeTaskId' as keyof this])
		}
	}

	switchLoop (loopName: string): void {
		if (this.settings?.loopName && this.settings.loopName !== loopName) {
			this.activeTask?.pause()
			this.state?.setActiveTaskId(undefined)
			this.unset(['state.activeTaskId' as keyof this])
		}
		this.settings?.setLoopName(loopName)
	}
}
