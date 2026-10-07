import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { AgentAction, ActionDescriptor } from './agent-action.entity'

export enum TaskStatus {
	PENDING = 'pending',
	IN_PROGRESS = 'in_progress',
	AWAITING_USER = 'awaiting_user',
	COMPLETED = 'completed',
	PAUSED = 'paused',
	ABANDONED = 'abandoned',
	CANCELLED = 'cancelled',
	FAILED = 'failed',
}

export interface AgentTaskProps extends BaseEntityProps {
	chatId?: string | ObjectId
	status?: TaskStatus
	goal?: string
	nextNode?: string
	threadId?: string
	previousTaskId?: string
	summary?: string
	loopName?: string
	planCount?: number
	planOffset?: number
	executedOffset?: number
	scratch?: Record<string, any>
}

export interface PlanStepDescriptor {
	stepId: string | number
	name: string
	args?: Record<string, any>
	dependsOn?: Array<string | number>
	reasoning?: string
}

export interface RefSources {
	stepOutput?: (action: AgentAction) => any
	context?: (name: string) => any
}

export interface CollectedRefs {
	steps: string[]
	contexts: string[]
}

const PATH = '((?:\\.[\\w-]+|\\[\\d+\\])*)'
const STEP_REF = new RegExp(`^\\{\\{step_([\\w-]+)\\.output${PATH}\\}\\}$`)
const STEP_REF_GLOBAL = new RegExp(`\\{\\{step_([\\w-]+)\\.output${PATH}\\}\\}`, 'g')
const CONTEXT_REF = new RegExp(`^\\{\\{context\\.([\\w-]+)${PATH}\\}\\}$`)
const CONTEXT_REF_GLOBAL = new RegExp(`\\{\\{context\\.([\\w-]+)${PATH}\\}\\}`, 'g')
const LEFTOVER_REF = /\{\{\s*(?:step_|context\.)/
const CLEARABLE_FIELDS = ['nextNode', 'scratch'] as const

function stringifyValue (value: any): string {
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function stableStringify (value: any): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
	if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
	return JSON.stringify(value) ?? 'null'
}

export function readPath (value: any, path?: string): any {
	if (!path) return value

	const segments = /\.([\w-]+)|\[(\d+)\]/g
	let current = value
	let match: RegExpExecArray | null

	while ((match = segments.exec(path)) !== null) {
		if (current === null || current === undefined) return undefined
		current = current[match[1] ?? match[2]]
	}

	return current
}

function scopeStepRefs (value: any, scope: (id: string) => string | undefined): any {
	if (typeof value === 'string') {
		return value.replace(/\{\{step_([\w-]+)(?=\.output)/g, (match: string, id: string) => {
			const scoped = scope(id)
			return scoped ? `{{step_${scoped}` : match
		})
	}

	if (Array.isArray(value)) return value.map(item => scopeStepRefs(item, scope))

	if (value !== null && typeof value === 'object') {
		const scoped: Record<string, any> = {}
		for (const key of Object.keys(value)) scoped[key] = scopeStepRefs(value[key], scope)
		return scoped
	}

	return value
}

function collectRefs (value: any, found: CollectedRefs = { steps: [], contexts: [] }): CollectedRefs {
	if (typeof value === 'string') {
		for (const match of value.matchAll(STEP_REF_GLOBAL)) found.steps.push(match[1])
		for (const match of value.matchAll(CONTEXT_REF_GLOBAL)) found.contexts.push(match[1])
		return found
	}

	if (Array.isArray(value)) {
		value.forEach(item => collectRefs(item, found))
		return found
	}

	if (value !== null && typeof value === 'object') {
		Object.keys(value).forEach(key => collectRefs(value[key], found))
	}

	return found
}

export class AgentTask extends BaseEntity {
	static factory (task: AgentTaskProps): AgentTask {
		const taskId = task._id && ObjectId.isValid(task._id)
			? new ObjectId(task._id)
			: new ObjectId()

		return AgentTask.fromJSON({
			...task,
			_id: taskId,
			status: task.status ?? TaskStatus.IN_PROGRESS,
		})
	}

	static fromJSON (props: AgentTaskProps): AgentTask {
		return new AgentTask(
			props,
			BaseEntity.toObjectId(props.chatId),
			props.status,
			props.goal,
			props.nextNode,
			props.threadId,
			props.previousTaskId,
			props.summary,
			props.loopName,
			props.planCount ?? 0,
			props.planOffset ?? 0,
			props.executedOffset ?? 0,
			props.scratch,
		)
	}

	static collectRefs (value: any): CollectedRefs {
		return collectRefs(value)
	}

	public actions: AgentAction[] = []
	public hydrated = true

	constructor (
		private readonly props: AgentTaskProps,
		public chatId?: ObjectId,
		public status?: TaskStatus,
		public goal?: string,
		public nextNode?: string,
		public threadId?: string,
		public previousTaskId?: string,
		public summary?: string,
		public loopName?: string,
		public planCount: number = 0,
		public planOffset: number = 0,
		public executedOffset: number = 0,
		public scratch?: Record<string, any>,
	) {
		super(props)
	}

	toJSON (): AgentTaskProps {
		return {
			...super.toJSON(),
			chatId: this.chatId,
			status: this.status,
			goal: this.goal,
			nextNode: this.nextNode,
			threadId: this.threadId,
			previousTaskId: this.previousTaskId,
			summary: this.summary,
			loopName: this.loopName,
			planCount: this.planCount,
			planOffset: this.planOffset,
			executedOffset: this.executedOffset,
			scratch: this.scratch,
		}
	}

	get id (): string {
		return this._id!.toString()
	}

	get clearedFields (): Record<string, ''> {
		return CLEARABLE_FIELDS.reduce((acc, field) => {
			if (this[field] === undefined) acc[field] = ''
			return acc
		}, {} as Record<string, ''>)
	}

	setActions (actions: AgentAction[]): void {
		this.actions = actions
		this.hydrated = true
	}

	setScratch (key: string, value: any): void {
		this.scratch = { ...this.scratch, [key]: value }
	}

	getScratch<T = any> (key: string): T | undefined {
		return this.scratch?.[key] as T | undefined
	}

	clearScratch (key: string): void {
		if (!this.scratch || !(key in this.scratch)) return

		const rest = { ...this.scratch }
		delete rest[key]
		this.scratch = Object.keys(rest).length ? rest : undefined
	}

	addAction (descriptor: ActionDescriptor): AgentAction {
		const action = AgentAction.factory({
			chatId: this.chatId,
			taskId: this._id,
			name: descriptor.name,
			stepId: descriptor.stepId,
			args: descriptor.args,
			dependsOn: descriptor.dependsOn,
			reasoning: descriptor.reasoning,
			author: descriptor.author,
		})
		this.actions.push(action)
		return action
	}

	addPlan (steps: PlanStepDescriptor[], author?: string): AgentAction[] {
		this.skipPending()
		this.planCount += 1

		const generation = this.planCount
		const localIds = new Set(steps.map(step => String(step.stepId)))
		const scopedId = (id: string | number) => `${generation}_${id}`
		const scope = (id: string) => localIds.has(id) ? scopedId(id) : undefined

		return steps.map(step => this.addAction({
			name: step.name,
			stepId: scopedId(step.stepId),
			args: scopeStepRefs(step.args, scope),
			dependsOn: step.dependsOn?.map(String).map(id => scope(id) ?? id),
			reasoning: step.reasoning,
			author,
		}))
	}

	skipPending (): number {
		const pending = this.actions.filter(a => a.status === 'pending')
		pending.forEach(a => a.markSkipped())
		return pending.length
	}

	approvePending (): number {
		const pending = this.actions.filter(a => a.status === 'pending')
		pending.forEach(a => a.approve())
		return pending.length
	}

	getAction (ref: string): AgentAction | undefined {
		return this.actions.find(a => a.id === ref || a.stepId === ref)
	}

	findLastByName (name: string): AgentAction | undefined {
		return this.actions.slice().reverse().find(a => a.name === name)
	}

	findExecuted (name: string | undefined, args: Record<string, any> | undefined, opts?: { status?: 'completed' | 'failed'; exclude?: AgentAction }): AgentAction | undefined {
		const signature = stableStringify(args ?? {})

		return this.actions.find(a => {
			if (a === opts?.exclude || !a.isTerminal || a.name !== name) return false
			if (opts?.status && a.status !== opts.status) return false
			return stableStringify(a.args ?? {}) === signature
		})
	}

	hasExecuted (name?: string, args?: Record<string, any>): boolean {
		return Boolean(this.findExecuted(name, args))
	}

	get readyActions (): AgentAction[] {
		const completedRefs = new Set(
			this.actions
				.filter(a => a.status === 'completed')
				.flatMap(a => [a.id, a.stepId].filter(Boolean) as string[])
		)
		return this.actions.filter(a => a.isReady && a.dependenciesSatisfiedBy(completedRefs))
	}

	get failedActions (): AgentAction[] {
		return this.actions.filter(a => a.status === 'failed')
	}

	get executedActions (): AgentAction[] {
		return this.actions.filter(a => a.isTerminal)
	}

	get lastExecutedAction (): AgentAction | undefined {
		return this.actions.slice().reverse().find(a => a.isTerminal)
	}

	get replanCount (): number {
		return Math.max(0, this.planCount - this.planOffset - 1)
	}

	get executedSinceOpen (): number {
		return Math.max(0, this.executedActions.length - this.executedOffset)
	}

	executionHistory (maxChars = 1500) {
		return this.executedActions.map(a => a.promptView(maxChars))
	}

	setNextNode (node?: string): void {
		this.nextNode = node
	}

	complete (summary?: string): void {
		this.status = TaskStatus.COMPLETED
		if (summary) this.summary = summary
		this.nextNode = undefined
	}

	fail (): void {
		this.status = TaskStatus.FAILED
		this.nextNode = undefined
	}

	cancel (): void {
		this.status = TaskStatus.CANCELLED
		this.nextNode = undefined
	}

	pause (): void {
		if (this.status === TaskStatus.IN_PROGRESS || this.status === TaskStatus.AWAITING_USER) {
			this.status = TaskStatus.PAUSED
		}
	}

	reopen (): void {
		this.status = TaskStatus.IN_PROGRESS
		this.nextNode = undefined
		this.planOffset = this.planCount
		this.executedOffset = this.executedActions.length
		this.clearScratch('replan_feedback')
		this.clearScratch('stop_reason')
	}

	findActionByRef (ref: string): AgentAction | undefined {
		return this.actions.find(a => a.stepId === ref || a.id === ref)
	}

	referencedActions (value: any): AgentAction[] {
		const { steps } = collectRefs(value)
		const found = steps.map(ref => this.findActionByRef(ref)).filter((a): a is AgentAction => Boolean(a))
		return Array.from(new Set(found))
	}

	resolveArgs (action: AgentAction, sources: RefSources, unresolved: string[] = []): any {
		return this.resolveValue(action.args, sources, unresolved)
	}

	private resolveValue (value: any, sources: RefSources, unresolved: string[]): any {
		if (typeof value === 'string') {
			const stepMatch = value.match(STEP_REF)
			if (stepMatch) {
				const resolved = this.readStepValue(stepMatch[1], stepMatch[2], sources)
				if (resolved === undefined) {
					unresolved.push(value)
					return value
				}
				return resolved
			}

			const contextMatch = value.match(CONTEXT_REF)
			if (contextMatch) {
				const resolved = readPath(sources.context?.(contextMatch[1]), contextMatch[2])
				if (resolved === undefined) {
					unresolved.push(value)
					return value
				}
				return resolved
			}

			const replaced = value
				.replace(STEP_REF_GLOBAL, (match: string, ref: string, path: string) => {
					const resolved = this.readStepValue(ref, path, sources)
					return resolved !== undefined ? stringifyValue(resolved) : match
				})
				.replace(CONTEXT_REF_GLOBAL, (match: string, name: string, path: string) => {
					const resolved = readPath(sources.context?.(name), path)
					return resolved !== undefined ? stringifyValue(resolved) : match
				})

			if (LEFTOVER_REF.test(replaced)) unresolved.push(replaced)

			return replaced
		}

		if (Array.isArray(value)) {
			return value.map(item => this.resolveValue(item, sources, unresolved))
		}

		if (value !== null && typeof value === 'object') {
			const resolved: Record<string, any> = {}
			for (const key of Object.keys(value)) {
				resolved[key] = this.resolveValue(value[key], sources, unresolved)
			}
			return resolved
		}

		return value
	}

	private readStepValue (ref: string, path: string | undefined, sources: RefSources): any {
		const target = this.findActionByRef(ref)
		if (!target || target.status !== 'completed') return undefined

		const output = sources.stepOutput?.(target) ?? target.structuredOutput
		return readPath(output, path)
	}
}
