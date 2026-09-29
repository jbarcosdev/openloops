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
}

const STEP_REF = /^\{\{step_([\w-]+)\.output\}\}$/
const STEP_REF_GLOBAL = /\{\{step_([\w-]+)\.output\}\}/g
const CONTEXT_REF = /^\{\{context\.([\w.-]+)\}\}$/
const CONTEXT_REF_GLOBAL = /\{\{context\.([\w.-]+)\}\}/g

function stringifyValue (value: any): string {
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
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

    getAction (ref: string): AgentAction | undefined {
        return this.actions.find(a => a.id === ref || a.stepId === ref)
    }

    findLastByName (name: string): AgentAction | undefined {
        return this.actions.slice().reverse().find(a => a.name === name)
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

    get lastExecutedAction (): AgentAction | undefined {
        return this.actions.slice().reverse().find(a => a.isTerminal)
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
    }

    resolveArgs (action: AgentAction, context: ChatContext): any {
        return this.resolveValue(action.args, context)
    }

    private resolveValue (value: any, context: ChatContext): any {
        if (typeof value === 'string') {
            const stepMatch = value.match(STEP_REF)
            if (stepMatch) {
                const target = this.findActionByRef(stepMatch[1])
                return target?.output !== undefined ? target.output : value
            }

            const contextMatch = value.match(CONTEXT_REF)
            if (contextMatch) {
                const resolved = this.readContextValue(contextMatch[1], context)
                return resolved !== undefined ? resolved : value
            }

            return value
                .replace(STEP_REF_GLOBAL, (_: string, ref: string) => {
                    const target = this.findActionByRef(ref)
                    return target?.output !== undefined ? stringifyValue(target.output) : ''
                })
                .replace(CONTEXT_REF_GLOBAL, (_: string, name: string) => {
                    const resolved = this.readContextValue(name, context)
                    return resolved !== undefined ? stringifyValue(resolved) : ''
                })
        }

        if (Array.isArray(value)) {
            return value.map(item => this.resolveValue(item, context))
        }

        if (value !== null && typeof value === 'object') {
            const resolved: Record<string, any> = {}
            for (const key of Object.keys(value)) {
                resolved[key] = this.resolveValue(value[key], context)
            }
            return resolved
        }

        return value
    }

    private findActionByRef (ref: string): AgentAction | undefined {
        return this.actions.find(a => a.stepId === ref || a.id === ref)
    }

    private readContextValue (name: string, context: ChatContext): any {
        const matches = context.selectContext({ taskId: this.id, name })
        return matches?.[0]?.content
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
        const resolvedArgs = this.resolveArgs(action, context)
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
