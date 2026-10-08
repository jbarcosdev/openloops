import { ObjectId } from 'mongodb'
import { Logger } from '@common/logger'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { Tool, BaseParams } from '@tools/tool'

export type ActionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface ActionErrorProps {
	message: string
	retryable?: boolean
	[key: string]: any
}

export interface AgentActionProps extends BaseEntityProps {
	chatId?: string | ObjectId
	taskId?: string | ObjectId
	name?: string
	stepId?: string
	args?: Record<string, any>
	dependsOn?: string[]
	status?: ActionStatus
	output?: any
	error?: ActionErrorProps
	reasoning?: string
	retries?: number
	author?: string
	approved?: boolean
	outputRef?: string
	outputChars?: number
	outputStub?: Record<string, any>
	callId?: string
	turn?: number
	startedAt?: Date
	completedAt?: Date
	answerId?: string | ObjectId
}

export interface OffloadedOutput {
	ref: string
	totalChars: number
	outline: any
	preview: string
}

const CLEARABLE_FIELDS = ['error', 'startedAt', 'completedAt', 'outputRef', 'outputChars', 'outputStub'] as const

export function truncateForPrompt (value: any, maxChars = 3000): any {
	if (value === undefined || value === null) return value
	const text = typeof value === 'string' ? value : JSON.stringify(value)
	if (text.length <= maxChars) return value
	return { truncated: true, total_chars: text.length, preview: text.slice(0, maxChars) }
}

export class AgentAction extends BaseEntity {
	private logger = new Logger()

	static factory (action: AgentActionProps): AgentAction {
		const actionId = action._id && ObjectId.isValid(action._id)
			? new ObjectId(action._id)
			: new ObjectId()

		return AgentAction.fromJSON({ ...action, _id: actionId, status: action.status ?? 'pending' })
	}

	static fromJSON (props: AgentActionProps): AgentAction {
		return new AgentAction(
			props,
			BaseEntity.toObjectId(props.chatId),
			BaseEntity.toObjectId(props.taskId),
			props.name,
			props.stepId,
			props.args,
			props.dependsOn,
			props.status,
			props.output,
			props.error,
			props.reasoning,
			props.retries,
			props.author,
			props.approved,
			props.outputRef,
			props.outputChars,
			props.startedAt,
			props.completedAt,
			BaseEntity.toObjectId(props.answerId),
			props.callId,
			props.turn,
			props.outputStub,
		)
	}

	constructor (
		private readonly props: AgentActionProps,
		public chatId?: ObjectId,
		public taskId?: ObjectId,
		public name?: string,
		public stepId?: string,
		public args?: Record<string, any>,
		public dependsOn?: string[],
		public status?: ActionStatus,
		public output?: any,
		public error?: ActionErrorProps,
		public reasoning?: string,
		public retries?: number,
		public author?: string,
		public approved?: boolean,
		public outputRef?: string,
		public outputChars?: number,
		public startedAt?: Date,
		public completedAt?: Date,
		public answerId?: ObjectId,
		public callId?: string,
		public turn?: number,
		public outputStub?: Record<string, any>,
	) {
		super(props)
	}

	toJSON (): AgentActionProps {
		return {
			...super.toJSON(),
			chatId: this.chatId,
			taskId: this.taskId,
			name: this.name,
			stepId: this.stepId,
			args: this.args,
			dependsOn: this.dependsOn,
			status: this.status,
			output: this.outputStub ?? this.structuredOutput,
			error: this.error,
			reasoning: this.reasoning,
			retries: this.retries,
			author: this.author,
			approved: this.approved,
			outputRef: this.outputRef,
			outputChars: this.outputChars,
			startedAt: this.startedAt,
			completedAt: this.completedAt,
			answerId: this.answerId,
			callId: this.callId,
			turn: this.turn,
			outputStub: this.outputStub,
		}
	}

	get id (): string {
		return this._id!.toString()
	}

	get isReady (): boolean {
		return this.status === 'pending'
	}

	get isTerminal (): boolean {
		return this.status === 'completed' || this.status === 'failed'
	}

	get canRetry (): boolean {
		return this.status === 'failed' && this.error?.retryable !== false
	}

	static unwrap (value: any): any {
		return value?.structuredContent ? value.structuredContent : value
	}

	get structuredOutput () {
		return AgentAction.unwrap(this.output)
	}

	observationOutput (stale: boolean, maxChars: number): any {
		if (this.outputStub) return stale ? this.outputStub : this.structuredOutput
		if (this.outputRef) return this.structuredOutput
		return truncateForPrompt(this.structuredOutput, maxChars)
	}

	get clearedFields (): Record<string, ''> {
		return CLEARABLE_FIELDS.reduce((acc, field) => {
			if (this[field] === undefined) acc[field] = ''
			return acc
		}, {} as Record<string, ''>)
	}

	promptView (maxChars = 3000) {
		return {
			ref: this.stepId ?? this.id,
			tool: this.name,
			args: this.args,
			status: this.status,
			output: this.observationOutput(false, maxChars),
			error: this.error ? { message: this.error.message } : undefined,
		}
	}

	dependenciesSatisfiedBy (completedRefs: Set<string>): boolean {
		if (!this.dependsOn?.length) return true
		return this.dependsOn.every(ref => completedRefs.has(ref))
	}

	approve (): void {
		this.approved = true
	}

	markRunning (): void {
		this.status = 'running'
		this.startedAt = new Date()
	}

	markCompleted (output: any): void {
		this.status = 'completed'
		this.output = output
		this.error = undefined
		this.completedAt = new Date()
	}

	markFailed (error: ActionErrorProps): void {
		this.status = 'failed'
		this.error = error
		this.completedAt = new Date()
	}

	markSkipped (): void {
		this.status = 'skipped'
		this.completedAt = new Date()
	}

	private static stubOf (offloaded: OffloadedOutput): Record<string, any> {
		return {
			workspace_ref: offloaded.ref,
			total_chars: offloaded.totalChars,
			outline: offloaded.outline,
			preview: offloaded.preview,
		}
	}

	offloadOutput (offloaded: OffloadedOutput): void {
		this.outputRef = offloaded.ref
		this.outputChars = offloaded.totalChars
		this.outputStub = undefined
		this.output = AgentAction.stubOf(offloaded)
	}

	keepOutputWithStub (offloaded: OffloadedOutput): void {
		this.outputRef = offloaded.ref
		this.outputChars = offloaded.totalChars
		this.outputStub = AgentAction.stubOf(offloaded)
	}

	incrementRetries (): number {
		this.retries = (this.retries ?? 0) + 1
		return this.retries
	}

	resetForRetry (): void {
		this.status = 'pending'
		this.error = undefined
		this.startedAt = undefined
		this.completedAt = undefined
	}

	async runTool (tool: Tool | undefined, args: Record<string, any>, baseParams: BaseParams): Promise<this> {
		if (!tool) {
			this.markFailed({ message: `Tool "${this.name}" not found`, retryable: false })
			return this
		}

		const validationErrors = tool.validate(args)
		if (validationErrors.length) {
			this.logger.debug({ tool: tool.name, args, validationErrors }, '[Agent Action] Invalid arguments')
			this.markFailed({ message: `Invalid arguments: ${validationErrors.join('; ')}`, retryable: false })
			return this
		}

		this.logger.debug({
			tool: tool.name,
			args,
		}, '[Agent Action] Running tool')

		this.markRunning()
		try {
			const result = await tool.run({ ...args, ...baseParams })
			this.markCompleted(result?.data)
		} catch (error: any) {
			this.markFailed({ message: error?.message ?? String(error), retryable: error?.retryable !== false })
		}
		return this
	}
}

export interface ActionDescriptor {
	name: string
	stepId?: string
	args?: Record<string, any>
	dependsOn?: string[]
	reasoning?: string
	author?: string
	callId?: string
	turn?: number
}
