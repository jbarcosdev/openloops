import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { Tool, BaseParams } from '@tools/tool'

export type ActionStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ActionErrorProps {
    message: string
    [key: string]: any
}

export interface AgentActionProps extends BaseEntityProps {
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
    startedAt?: Date
    completedAt?: Date
}

export class AgentAction extends BaseEntity {
    static factory (action: AgentActionProps): AgentAction {
        const actionId = action._id && ObjectId.isValid(action._id)
            ? new ObjectId(action._id)
            : new ObjectId()

        return AgentAction.fromJSON({ ...action, _id: actionId, status: action.status ?? 'pending' })
    }

    static fromJSON (props: AgentActionProps): AgentAction {
        return new AgentAction(
            props,
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
            props.startedAt,
            props.completedAt,
        )
    }

    constructor (
        private readonly props: AgentActionProps,
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
        public startedAt?: Date,
        public completedAt?: Date,
    ) {
        super(props)
    }

    toJSON (): AgentActionProps {
        return {
            ...super.toJSON(),
            name: this.name,
            stepId: this.stepId,
            args: this.args,
            dependsOn: this.dependsOn,
            status: this.status,
            output: this.output,
            error: this.error,
            reasoning: this.reasoning,
            retries: this.retries,
            author: this.author,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
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

    dependenciesSatisfiedBy (completedRefs: Set<string>): boolean {
        if (!this.dependsOn?.length) return true
        return this.dependsOn.every(ref => completedRefs.has(ref))
    }

    markRunning (): void {
        this.status = 'running'
        this.startedAt = new Date()
    }

    markCompleted (output: any): void {
        this.status = 'completed'
        this.output = output
        this.completedAt = new Date()
    }

    markFailed (error: ActionErrorProps): void {
        this.status = 'failed'
        this.error = error
        this.completedAt = new Date()
    }

    incrementRetries (): number {
        this.retries = (this.retries ?? 0) + 1
        return this.retries
    }

    /** Vuelve a dejar la action en `pending` para un nuevo intento — usar junto a incrementRetries() */
    resetForRetry (): void {
        this.status = 'pending'
        this.error = undefined
        this.startedAt = undefined
        this.completedAt = undefined
    }

    /** Corre una tool con los argumentos ya resueltos y registra el resultado en sí misma */
    async runTool (tool: Tool | undefined, args: Record<string, any>, baseParams: BaseParams): Promise<this> {
        if (!tool) {
            this.markFailed({ message: `Tool "${this.name}" not found` })
            return this
        }

        this.markRunning()
        try {
            const result = await tool.run({ ...args, ...baseParams })
            this.markCompleted(result?.data)
        } catch (error: any) {
            this.markFailed({ message: error?.message ?? String(error) })
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
}
