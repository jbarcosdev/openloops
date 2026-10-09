import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import type { LLMMessage } from '@clients/llm-types'
import { AgentAction, ActionDescriptor, truncateForPrompt } from './agent-action.entity'

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
	threadId?: string | ObjectId
	previousTaskId?: string
	summary?: string
	loopName?: string
	planCount?: number
	planOffset?: number
	executedOffset?: number
	scratch?: Record<string, any>
	opening?: string
	turns?: TurnRecord[]
	known?: Record<string, string>
	schemas?: Record<string, ToolSchemaSummary>
}

export interface ToolSchemaSummary {
	required: string[]
	optional: string[]
}

export interface TurnRecord {
	turn: number
	reasoning?: string
	state?: Record<string, any>
}

export interface ActionRequest {
	tool?: string
	arguments?: Record<string, any> | string
}

export interface TurnOutput {
	reasoning?: string
	state?: Record<string, any>
	actions?: ActionRequest[]
	learned?: { key?: string; value?: any }[]
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

export const ASK_USER = 'ask_user'
export const SEARCH_TOOLS = 'search_tools'
export const RESPOND = 'respond'
export const NATIVE_TOOL_NAMES = [SEARCH_TOOLS, 'read_context', 'save_context', ASK_USER, RESPOND]

const TOOL_NAMESPACE = /^functions\./
const INVALID_RESPONSE = 'invalid_response'
const INVALID_ACTION = 'invalid_action'
const STATE_KEYS = 12
const KNOWN_ENTRIES = 40
const KNOWN_KEY_CHARS = 80
const KNOWN_VALUE_CHARS = 300
const SCHEMA_TOOLS = 30
const SCHEMA_PROPERTIES = 15
const SCHEMA_SCAN_NODES = 20000
const SCHEMA_SCAN_DEPTH = 8
const STATE_VALUE_CHARS = 800
const REASONING_CHARS = 1500

const TOOL_RESULT_CHARS = 100000
const FULL_OBSERVATION_TURNS = 1

const PATH = '((?:\\.[\\w-]+|\\[\\d+\\])*)'
const STEP_REF = new RegExp(`^\\{\\{step_([\\w-]+)\\.output${PATH}\\}\\}$`)
const STEP_REF_GLOBAL = new RegExp(`\\{\\{step_([\\w-]+)\\.output${PATH}\\}\\}`, 'g')
const CONTEXT_REF = new RegExp(`^\\{\\{context\\.([\\w-]+)${PATH}\\}\\}$`)
const CONTEXT_REF_GLOBAL = new RegExp(`\\{\\{context\\.([\\w-]+)${PATH}\\}\\}`, 'g')
const LEFTOVER_REF = /\{\{\s*(?:step_|context\.)/
const CLEARABLE_FIELDS = ['nextNode', 'scratch'] as const

function normalizeToolName (name: string): string {
	return name.toLowerCase().replace(/-/g, '_')
}

export function resolveToolName (name: string, declared: string[]): string | undefined {
	if (declared.includes(name)) return undefined

	const wanted = normalizeToolName(name)
	const unique = (candidates: string[]) => candidates.length === 1 ? candidates[0] : undefined

	const sameName = unique(declared.filter(candidate => normalizeToolName(candidate) === wanted))
	if (sameName) return sameName

	const withoutPrefix = unique(declared.filter(candidate => candidate.includes('__') && normalizeToolName(candidate).endsWith(`__${wanted}`)))
	if (withoutPrefix) return withoutPrefix

	const separator = name.indexOf('__')
	if (separator <= 0) return undefined

	const rest = normalizeToolName(name.slice(separator + 2))

	return unique(declared.filter(candidate => !candidate.includes('__') && normalizeToolName(candidate) === rest))
}

export function findInvoker (tools: { name: string; parameters?: Record<string, any> }[]): string | undefined {
	const invokers = tools.filter(tool => tool.name.endsWith('__invoke_tool') && tool.parameters?.properties?.name && tool.parameters?.properties?.arguments)

	return invokers.length === 1 ? invokers[0].name : undefined
}

export function seenHiddenTool (written: string, invoker: string, schemas?: Record<string, unknown>): string | undefined {
	if (!schemas) return undefined

	const separator = written.indexOf('__')
	const namespace = invoker.slice(0, invoker.indexOf('__'))

	if (separator > 0 && normalizeToolName(written.slice(0, separator)) !== normalizeToolName(namespace)) return undefined

	const bare = normalizeToolName(separator > 0 ? written.slice(separator + 2) : written)

	return Object.keys(schemas).find(key => normalizeToolName(key) === bare)
}

function routeNote (action: AgentAction): string | undefined {
	if (!action.requestedName) return undefined

	return action.name?.endsWith('__invoke_tool') && action.args?.name && !/(^|__)invoke_tool$/.test(action.requestedName)
		? `"${action.requestedName}" is a hidden tool and cannot be called directly, so it ran through "${action.name}" as "${action.args?.name}". Call hidden tools like that from now on: tool "${action.name}", arguments {"name": "${action.args?.name}", "arguments": {...}}, with the name written without the server prefix.`
		: `You wrote "${action.requestedName}" but the tool is named "${action.name}": the server prefix is part of the name. It ran as "${action.name}". Write the full name next time.`
}

function propertyLabel (name: string, property: any): string {
	const type = Array.isArray(property?.type) ? property.type.join('|') : property?.type ?? property?.anyOf?.map((option: any) => option?.type).filter((option: any) => option && option !== 'null').join('|')

	return type ? `${name} (${type})` : name
}

function summarizeSchema (schema: any): ToolSchemaSummary | undefined {
	const properties = schema?.properties

	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return undefined

	const required = Array.isArray(schema.required) ? schema.required.filter((name: any) => typeof name === 'string') : []
	const names = Object.keys(properties)

	return {
		required: required.slice(0, SCHEMA_PROPERTIES).map((name: string) => propertyLabel(name, properties[name])),
		optional: names.filter(name => !required.includes(name)).slice(0, SCHEMA_PROPERTIES).map(name => propertyLabel(name, properties[name])),
	}
}

function findToolSchemas (value: any): Record<string, ToolSchemaSummary> {
	const found: Record<string, ToolSchemaSummary> = {}
	let nodes = 0

	const visit = (node: any, depth: number) => {
		if (node === null || typeof node !== 'object' || depth > SCHEMA_SCAN_DEPTH || nodes++ > SCHEMA_SCAN_NODES) return

		if (Array.isArray(node)) {
			node.forEach(item => visit(item, depth + 1))
			return
		}

		const schema = node.input_schema ?? node.inputSchema

		if (typeof node.name === 'string' && schema && typeof schema === 'object') {
			const summary = summarizeSchema(schema)
			if (summary) found[node.name] = summary
		}

		Object.values(node).forEach(child => visit(child, depth + 1))
	}

	visit(value, 0)

	return found
}

function isNativeTool (name?: string): boolean {
	return NATIVE_TOOL_NAMES.includes(name as string)
}

function capState (state: any): Record<string, any> | undefined {
	if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined

	const capped: Record<string, any> = {}

	for (const key of Object.keys(state).slice(0, STATE_KEYS)) {
		capped[key] = truncateForPrompt(state[key], STATE_VALUE_CHARS)
	}

	return capped
}

function parseArguments (value: any): { args: Record<string, any>; invalid?: string } {
	let args = value

	if (typeof args === 'string') {
		try { args = JSON.parse(args) } catch { return { args: {}, invalid: '"arguments" must be a JSON object' } }
	}

	if (args === undefined || args === null) return { args: {} }
	if (typeof args !== 'object' || Array.isArray(args)) return { args: {}, invalid: '"arguments" must be a JSON object' }

	return { args }
}

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
			BaseEntity.toObjectId(props.threadId),
			props.previousTaskId,
			props.summary,
			props.loopName,
			props.planCount ?? 0,
			props.planOffset ?? 0,
			props.executedOffset ?? 0,
			props.scratch,
			props.opening,
			props.turns ?? [],
			props.known,
			props.schemas,
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
		public threadId?: ObjectId,
		public previousTaskId?: string,
		public summary?: string,
		public loopName?: string,
		public planCount: number = 0,
		public planOffset: number = 0,
		public executedOffset: number = 0,
		public scratch?: Record<string, any>,
		public opening?: string,
		public turns: TurnRecord[] = [],
		public known?: Record<string, string>,
		public schemas?: Record<string, ToolSchemaSummary>,
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
			planCount: this.planCount || undefined,
			planOffset: this.planOffset || undefined,
			executedOffset: this.executedOffset || undefined,
			scratch: this.scratch,
			opening: this.opening,
			turns: this.turns.length ? this.turns : undefined,
			known: this.known && Object.keys(this.known).length ? this.known : undefined,
			schemas: this.schemas && Object.keys(this.schemas).length ? this.schemas : undefined,
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
			callId: descriptor.callId,
			turn: descriptor.turn,
			requestedName: descriptor.requestedName,
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
		return this.actions.filter(a => a.isReady && a.name !== ASK_USER && a.name !== RESPOND && a.dependenciesSatisfiedBy(completedRefs))
	}

	get pendingQuestion (): string | undefined {
		const ask = this.actions.find(a => a.name === ASK_USER && a.status === 'pending')
		return ask ? String(ask.args?.question ?? '') : undefined
	}

	get turnCount (): number {
		return this.turns.length
	}

	get toolCallCount (): number {
		return this.actions.filter(a => a.turn !== undefined && a.isTerminal && a.name !== ASK_USER && a.name !== RESPOND).length
	}

	answerQuestion (answer: string): boolean {
		const ask = this.actions.find(a => a.name === ASK_USER && a.status === 'pending')
		if (!ask) return false

		ask.markCompleted({ answer })
		this.remember([{ key: `user_answer_${ask.stepId ?? ask.id}`, value: `${answer} | in answer to: ${String(ask.args?.question ?? '')}` }])
		return true
	}

	get state (): Record<string, any> | undefined {
		return this.turns.length ? this.turns[this.turns.length - 1].state : undefined
	}

	get pendingAnswer (): string | undefined {
		const respond = this.actions.find(a => a.name === RESPOND && a.status === 'pending')
		return respond ? String(respond.args?.answer ?? '') : undefined
	}

	get rejectedAnswers (): number {
		return this.actions.filter(a => a.name === RESPOND && a.status === 'failed').length
	}

	rejectAnswer (message: string): void {
		this.actions.find(a => a.name === RESPOND && a.status === 'pending')?.markFailed({ message, retryable: false })
	}

	forceAnswer (fallback: string): string {
		const answer = this.pendingAnswer || fallback
		this.skipPending()
		return answer
	}

	static answerFrom (output: TurnOutput): string | undefined {
		const respond = (Array.isArray(output.actions) ? output.actions : []).find(request => request?.tool === RESPOND)
		const { args } = parseArguments(respond?.arguments)
		const answer = String(args.answer ?? '').trim()
		return answer || undefined
	}

	deliverAnswer (): void {
		this.actions.filter(a => a.name === RESPOND && a.status === 'pending').forEach(a => a.markCompleted({ delivered: true }))
	}

	remember (learned: any): void {
		if (!Array.isArray(learned)) return

		const known: Record<string, string> = { ...this.known }

		for (const item of learned) {
			const key = typeof item?.key === 'string' ? item.key.trim().slice(0, KNOWN_KEY_CHARS) : ''
			const value = item?.value === undefined || item?.value === null ? '' : stringifyValue(item.value).trim().slice(0, KNOWN_VALUE_CHARS)

			if (!key || !value) continue

			const existing = Object.keys(known).find(candidate => candidate.toLowerCase() === key.toLowerCase())
			if (existing) delete known[existing]

			known[key] = value
		}

		const keys = Object.keys(known)
		for (const key of keys.slice(0, Math.max(0, keys.length - KNOWN_ENTRIES))) delete known[key]

		this.known = Object.keys(known).length ? known : undefined
	}

	learnSchemas (output: any): void {
		const found = findToolSchemas(output)
		const names = Object.keys(found)

		if (!names.length) return

		const schemas: Record<string, ToolSchemaSummary> = { ...this.schemas }

		for (const name of names) {
			delete schemas[name]
			schemas[name] = found[name]
		}

		const keys = Object.keys(schemas)
		for (const key of keys.slice(0, Math.max(0, keys.length - SCHEMA_TOOLS))) delete schemas[key]

		this.schemas = schemas
	}

	addTurn (output: TurnOutput, opts?: { author?: string; declaredTools?: string[]; invoker?: string }): AgentAction[] {
		const turn = this.turns.reduce((max, t) => Math.max(max, t.turn), 0) + 1

		this.remember(output.learned)

		this.turns.push({ turn, reasoning: output.reasoning?.toString().trim().slice(0, REASONING_CHARS) || undefined, state: capState(output.state) })

		const requests = Array.isArray(output.actions) ? output.actions : []

		if (!requests.length) {
			const action = this.addAction({ name: INVALID_RESPONSE, args: {}, stepId: `${turn}_1`, turn, author: opts?.author })
			action.markFailed({ message: 'Your response had no actions. Return at least one action; to finish the task use the respond tool with your final answer.', retryable: false })
			return [action]
		}

		return requests.map((request, position) => {
			const written = typeof request?.tool === 'string' && request.tool.trim() ? request.tool.trim().replace(TOOL_NAMESPACE, '') : undefined
			const resolved = written && opts?.declaredTools ? resolveToolName(written, opts.declaredTools) : undefined
			const { args: given, invalid: badArguments } = parseArguments(request?.arguments)
			const hiddenName = !resolved && written && opts?.invoker && opts.declaredTools && !opts.declaredTools.includes(written) && !NATIVE_TOOL_NAMES.includes(written) && !badArguments ? seenHiddenTool(written, opts.invoker, this.schemas) : undefined
			const hidden = Boolean(hiddenName)
			const name = hidden ? opts!.invoker : resolved ?? written
			const args = hidden ? { name: hiddenName, arguments: given } : given

			const action = this.addAction({ name: name ?? INVALID_ACTION, args, stepId: `${turn}_${position + 1}`, turn, author: opts?.author, requestedName: resolved || hidden ? written : undefined })

			const invalid = !name ? 'Each action needs a "tool" name'
				: badArguments ? badArguments
				: name === ASK_USER && !String(args.question ?? '').trim() ? 'ask_user requires a non-empty "question"'
				: name === RESPOND && !String(args.answer ?? '').trim() ? 'respond requires a non-empty "answer"'
				: undefined

			if (invalid) action.markFailed({ message: invalid, retryable: false })

			return action
		})
	}

	history (notice?: Record<string, any>): LLMMessage[] {
		if (!this.opening) return []

		const byTurn = new Map<number, AgentAction[]>()

		for (const action of this.actions) {
			if (action.turn === undefined) continue
			byTurn.set(action.turn, [...(byTurn.get(action.turn) ?? []), action])
		}

		const messages: LLMMessage[] = [{ role: 'user', content: this.opening }]

		const included = this.turns.filter(record => {
			const actions = byTurn.get(record.turn) ?? []
			return actions.length && actions.every(a => a.isTerminal)
		})
		const freshFrom = included.length - FULL_OBSERVATION_TURNS

		for (const [index, record] of included.entries()) {
			const actions = byTurn.get(record.turn) ?? []
			const stale = index < freshFrom

			messages.push({
				role: 'assistant',
				content: JSON.stringify({
					reasoning: record.reasoning,
					...(record.state ? { state: record.state } : {}),
					actions: actions.filter(a => a.name !== INVALID_RESPONSE).map(a => ({ tool: a.name, arguments: a.args ?? {} })),
				}),
			})

			messages.push({
				role: 'user',
				content: JSON.stringify({
					OBSERVATIONS: actions.map(action => {
						const ref = action.stepId ?? action.id
						const routed = routeNote(action)
						const note = routed ? { note: routed } : {}

						if (action.status === 'skipped') return { ref, tool: action.name, status: 'skipped', ...note }

						return action.status === 'failed'
							? { ref, tool: action.name, status: 'failed', error: action.error?.message, ...note }
							: { ref, tool: action.name, status: 'completed', output: action.observationOutput(stale, TOOL_RESULT_CHARS), ...note }
					}),
				}),
			})
		}

		if (notice && Object.keys(notice).length) {
			const last = messages[messages.length - 1]
			let content: Record<string, any> = {}

			try { content = JSON.parse(String(last.content)) } catch { content = {} }

			messages[messages.length - 1] = { role: 'user', content: JSON.stringify({ ...content, HARNESS: notice }) }
		}

		return messages
	}

	get workspaceStreak (): number {
		const turns = new Map<number, string[]>()

		for (const action of this.actions) {
			if (action.turn === undefined || !action.name) continue
			turns.set(action.turn, [...(turns.get(action.turn) ?? []), action.name])
		}

		let count = 0

		for (const turn of Array.from(turns.keys()).sort((a, b) => b - a)) {
			if (!turns.get(turn)!.every(name => name === 'read_context' || name === 'save_context')) break
			count++
		}

		return count
	}

	get sameToolStreak (): { name?: string; count: number } {
		const turns = new Map<number, Set<string>>()

		for (const action of this.actions) {
			if (action.turn === undefined || !action.name) continue
			turns.set(action.turn, (turns.get(action.turn) ?? new Set()).add(action.name))
		}

		let name: string | undefined
		let count = 0

		for (const turn of Array.from(turns.keys()).sort((a, b) => b - a)) {
			const names = turns.get(turn)!
			const only = names.size === 1 ? Array.from(names)[0] : undefined

			if (!only || (name && only !== name)) break

			name = only
			count++
		}

		return { name, count }
	}

	get discoveredToolNames (): string[] {
		const names = this.actions
			.filter(a => a.name === SEARCH_TOOLS && a.status === 'completed')
			.flatMap(a => (a.structuredOutput?.tools ?? []).map((tool: any) => tool?.name))
			.filter((name: any) => typeof name === 'string')

		return Array.from(new Set<string>(names))
	}

	get failedActions (): AgentAction[] {
		return this.actions.filter(a => a.status === 'failed')
	}

	get executedActions (): AgentAction[] {
		return this.actions.filter(a => a.isTerminal)
	}

	get replanCount (): number {
		return Math.max(0, this.planCount - this.planOffset - 1)
	}

	get executedSinceOpen (): number {
		return Math.max(0, this.executedActions.length - this.executedOffset)
	}

	get lastExecutedAction (): AgentAction | undefined {
		return this.actions.slice().reverse().find(a => a.isTerminal)
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
