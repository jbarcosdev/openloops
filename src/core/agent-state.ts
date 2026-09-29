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

export interface AgentStateProps {
    status?: AgentStatus
    language?: string
    lastError?: AgentError
    activeTaskId?: string
    stopRequested?: boolean
    currentActivity?: CurrentActivity
}

export class AgentState {
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

    setCurrentActivity (currentActivity: CurrentActivity): void {
        this.currentActivity = currentActivity
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
        this.language = 'en'
        this.status = AgentStatus.IDLE
        this.activeTaskId = undefined
        this.lastError = undefined
        this.stopRequested = false
    }
}
