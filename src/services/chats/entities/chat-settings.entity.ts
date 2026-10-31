import type { SelectableThinkingEffort } from '@clients/llm/llm-types'

export type ExecutionMode = 'interactive' | 'autonomous'

export interface ChatSettingsProps {
    notifyOnCompletion?: boolean
    isPrivateSession?: boolean
    modelProvider?: string
    modelName?: string,
    loopName?: string,
    executionMode?: ExecutionMode,
    thinkingEffort?: SelectableThinkingEffort,
}

export class ChatSettings {
    constructor (
        private readonly props: ChatSettingsProps,
        public notifyOnCompletion?: boolean,
        public isPrivateSession?: boolean,
        public modelProvider?: string,
        public modelName?: string,
        public loopName?: string,
        public executionMode?: ExecutionMode,
        public thinkingEffort?: SelectableThinkingEffort,
    ) {}

    static fromJSON (props: ChatSettingsProps) {
        return new ChatSettings(
            props,
            props.notifyOnCompletion,
            props.isPrivateSession,
            props.modelProvider,
            props.modelName,
            props.loopName,
            props.executionMode,
            props.thinkingEffort,
        )
    }

    toJSON (): ChatSettingsProps {
        return {
            notifyOnCompletion: this.notifyOnCompletion,
            isPrivateSession: this.isPrivateSession,
            modelProvider: this.modelProvider,
            modelName: this.modelName,
            loopName: this.loopName,
            executionMode: this.executionMode,
            thinkingEffort: this.thinkingEffort,
        }
    }

    setLoopName (loopName: string): void {
        this.loopName = loopName
    }

    setExecutionMode (executionMode: ExecutionMode): void {
        this.executionMode = executionMode
    }

    setThinkingEffort (thinkingEffort: SelectableThinkingEffort): void {
        this.thinkingEffort = thinkingEffort
    }

    setModelProvider (modelProvider: string): void {
        this.modelProvider = modelProvider
    }

    setModelName (modelName: string): void {
        this.modelName = modelName
    }

    setNotifyOnCompletion (notifyOnCompletion: boolean): void {
        this.notifyOnCompletion = notifyOnCompletion
    }

    setIsPrivateSession (isPrivateSession: boolean): void {
        this.isPrivateSession = isPrivateSession
    }
}
