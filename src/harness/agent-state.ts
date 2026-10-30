export enum AgentStatus {
    IDLE = 'idle',
    FAILED = 'failed',
    PROCESSING = 'processing',
    AWAITING_USER_INPUT = 'awaiting_user_input',
    AWAITING_USER_CONFIRMATION = 'awaiting_user_confirmation',
}

export interface AgentError {
    code: string
    message: string
    isRetryable: boolean
    timestamp: Date
}

type CurrentActivity = 'running' | 'stopped' | (string & {})

export type ActivityListener = (activity: string) => void

export interface AgentStateProps {
    status?: AgentStatus
    language?: string
    lastError?: AgentError
    activeTaskId?: string
    stopRequested?: boolean
    currentActivity?: CurrentActivity
}

export class AgentState {
    private activityListener?: ActivityListener

    static fromJSON (props: AgentStateProps = {}): AgentState {
        return new AgentState(
            props.status,
            props.language,
            props.lastError,
            props.activeTaskId,
            props.stopRequested,
            props.currentActivity,
        )
    }

    constructor (
        public status?: AgentStatus,
        public language?: string,
        public lastError?: AgentError,
        public activeTaskId?: string,
        public stopRequested?: boolean,
        public currentActivity?: CurrentActivity,
    ) {}

    toJSON (): AgentStateProps {
        return {
            currentActivity: this.currentActivity,
            language: this.language,
            status: this.status,
            activeTaskId: this.activeTaskId,
            lastError: this.lastError,
            stopRequested: this.stopRequested,
        }
    }

    setLanguage (language?: string): void {
        if (language) this.language = language
    }

    onActivityChange (listener?: ActivityListener): void {
        this.activityListener = listener
    }

    setCurrentActivity (currentActivity: CurrentActivity): void {
        const changed = this.currentActivity !== currentActivity
        this.currentActivity = currentActivity
        if (changed) this.activityListener?.(currentActivity)
    }

    setStatus (status: AgentStatus): void {
        this.status = status
    }

    setActiveTaskId (taskId?: string): void {
        this.activeTaskId = taskId
    }

    setLastError (lastError?: AgentError): void {
        this.lastError = lastError
    }

    setStopRequested (stopRequested: boolean = true): void {
        this.stopRequested = stopRequested
    }

    interruptExecution (): void {
        this.stopRequested = true
    }

    cleanContext (): void {
        this.currentActivity = ''
        this.language = undefined
        this.status = AgentStatus.IDLE
        this.activeTaskId = undefined
        this.lastError = undefined
        this.stopRequested = false
    }
}
