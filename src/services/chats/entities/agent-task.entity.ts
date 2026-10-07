import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { AgentAction, AgentActionProps, ActionDescriptor } from './agent-action.entity'
import { ChatContext } from './chat-context.entity'
import { Tool, BaseParams } from '@tools/tool'

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
    status?: TaskStatus
    goal?: string
    nextNode?: string
    threadId?: string
    previousTaskId?: string
    summary?: string
    loopName?: string
    actions?: AgentActionProps[]
    planCount?: number
    planOffset?: number
    executedOffset?: number
}

export interface PlanStepDescriptor {
    stepId: string | number
    name: string
    args?: Record<string, any>
    dependsOn?: Array<string | number>
    reasoning?: string
}

const PATH = '((?:\\.[\\w-]+|\\[\\d+\\])*)'
const STEP_REF = new RegExp(`^\\{\\{step_([\\w-]+)\\.output${PATH}\\}\\}$`)
const STEP_REF_GLOBAL = new RegExp(`\\{\\{step_([\\w-]+)\\.output${PATH}\\}\\}`, 'g')
const CONTEXT_REF = new RegExp(`^\\{\\{context\\.([\\w-]+)${PATH}\\}\\}$`)
const CONTEXT_REF_GLOBAL = new RegExp(`\\{\\{context\\.([\\w-]+)${PATH}\\}\\}`, 'g')
const LEFTOVER_REF = /\{\{\s*(?:step_|context\.)/

function stringifyValue (value: any): string {
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function stableStringify (value: any): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
    if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
    return JSON.stringify(value) ?? 'null'
}

function readPath (value: any, path?: string): any {
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
            props.status,
            props.goal,
            props.nextNode,
            props.threadId,
            props.previousTaskId,
            props.summary,
            props.loopName,
            props.actions?.map(a => AgentAction.factory(a)) ?? [],
            props.planCount ?? 0,
            props.planOffset ?? 0,
            props.executedOffset ?? 0,
        )
    }

    constructor (
        private readonly props: AgentTaskProps,
        public status?: TaskStatus,
        public goal?: string,
        public nextNode?: string,
        public threadId?: string,
        public previousTaskId?: string,
        public summary?: string,
        public loopName?: string,
        public actions: AgentAction[] = [],
        public planCount: number = 0,
        public planOffset: number = 0,
        public executedOffset: number = 0,
    ) {
        super(props)
    }

    toJSON (): AgentTaskProps {
        return {
            ...super.toJSON(),
            status: this.status,
            goal: this.goal,
            nextNode: this.nextNode,
            threadId: this.threadId,
            previousTaskId: this.previousTaskId,
            summary: this.summary,
            loopName: this.loopName,
            actions: this.actions.map(a => a.toJSON()),
            planCount: this.planCount,
            planOffset: this.planOffset,
            executedOffset: this.executedOffset,
        }
    }

    get id (): string {
        return this._id!.toString()
    }

    addAction (descriptor: ActionDescriptor): AgentAction {
        const action = AgentAction.factory({
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

    /** Encola un plan completo: descarta lo pendiente del plan anterior y da a cada step un id único por generación (`<generación>_<step>`), reescribiendo dependsOn y referencias locales */
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

    getAction (ref: string): AgentAction | undefined {
        return this.actions.find(a => a.id === ref || a.stepId === ref)
    }

    findLastByName (name: string): AgentAction | undefined {
        return this.actions.slice().reverse().find(a => a.name === name)
    }

    hasExecuted (name?: string, args?: Record<string, any>): boolean {
        const signature = stableStringify(args ?? {})
        return this.actions.some(a => a.isTerminal && a.name === name && stableStringify(a.args ?? {}) === signature)
    }

    /** Actions en `pending` cuyas dependencias (por stepId o id) ya están `completed` */
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
    }

    resolveArgs (action: AgentAction, context: ChatContext, unresolved: string[] = []): any {
        return this.resolveValue(action.args, context, unresolved)
    }

    private resolveValue (value: any, context: ChatContext, unresolved: string[]): any {
        if (typeof value === 'string') {
            const stepMatch = value.match(STEP_REF)
            if (stepMatch) {
                const resolved = this.readStepValue(stepMatch[1], stepMatch[2])
                if (resolved === undefined) {
                    unresolved.push(value)
                    return value
                }
                return resolved
            }

            const contextMatch = value.match(CONTEXT_REF)
            if (contextMatch) {
                const resolved = this.readContextValue(contextMatch[1], contextMatch[2], context)
                if (resolved === undefined) {
                    unresolved.push(value)
                    return value
                }
                return resolved
            }

            const replaced = value
                .replace(STEP_REF_GLOBAL, (match: string, ref: string, path: string) => {
                    const resolved = this.readStepValue(ref, path)
                    return resolved !== undefined ? stringifyValue(resolved) : match
                })
                .replace(CONTEXT_REF_GLOBAL, (match: string, name: string, path: string) => {
                    const resolved = this.readContextValue(name, path, context)
                    return resolved !== undefined ? stringifyValue(resolved) : match
                })

            if (LEFTOVER_REF.test(replaced)) unresolved.push(replaced)

            return replaced
        }

        if (Array.isArray(value)) {
            return value.map(item => this.resolveValue(item, context, unresolved))
        }

        if (value !== null && typeof value === 'object') {
            const resolved: Record<string, any> = {}
            for (const key of Object.keys(value)) {
                resolved[key] = this.resolveValue(value[key], context, unresolved)
            }
            return resolved
        }

        return value
    }

    private findActionByRef (ref: string): AgentAction | undefined {
        return this.actions.find(a => a.stepId === ref || a.id === ref)
    }

    private readStepValue (ref: string, path?: string): any {
        const target = this.findActionByRef(ref)
        if (!target || target.status !== 'completed') return undefined
        return readPath(target.structuredOutput, path)
    }

    private readContextValue (name: string, path: string | undefined, context: ChatContext): any {
        const record = context.lastContext({ taskId: this.id, name })
        return readPath(record?.content, path)
    }

    /** Crea una action nueva y la corre de inmediato (estilo reactivo) */
    async runTool (descriptor: ActionDescriptor, tool: Tool | undefined, context: ChatContext, baseParams: BaseParams): Promise<AgentAction> {
        const action = this.addAction(descriptor)
        return this.executeToolAction(action, tool, context, baseParams)
    }

    /** Corre una action ya encolada (estilo por lotes: actionPlanner encola, esto ejecuta cuando está `ready`) */
    async runReadyAction (actionRef: string, tool: Tool | undefined, context: ChatContext, baseParams: BaseParams): Promise<AgentAction> {
        const action = this.getAction(actionRef)
        if (!action) throw new Error(`[AgentTask] Action "${actionRef}" not found`)
        return this.executeToolAction(action, tool, context, baseParams)
    }

    private async executeToolAction (action: AgentAction, tool: Tool | undefined, context: ChatContext, baseParams: BaseParams): Promise<AgentAction> {
        const unresolved: string[] = []
        const resolvedArgs = this.resolveArgs(action, context, unresolved)

        if (unresolved.length) {
            action.markFailed({ message: `Unresolved references in arguments: ${unresolved.join(', ')}. The referenced step output or path does not exist.`, retryable: false })
            return action
        }

        const executed = await action.runTool(tool, resolvedArgs, baseParams)

        if (executed.status === 'completed' && executed.name) {
            context.addContext({
                taskId: this.id,
                meta: { name: executed.name, type: 'tool_output', shortDescription: `Output of ${executed.name}` },
                content: executed.output,
            })
        }

        return executed
    }
}
