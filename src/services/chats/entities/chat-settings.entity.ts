export type ExecutionMode = 'interactive' | 'autonomous'

export interface ChatSettingsProps {
    notifyOnCompletion?: boolean
    isPrivateSession?: boolean
    modelProvider?: string
    modelName?: string,
    loopName?: string,
    executionMode?: ExecutionMode,
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
        }
    }

    setLoopName (loopName: string): void {
        this.loopName = loopName
    }

    setExecutionMode (executionMode: ExecutionMode): void {
        this.executionMode = executionMode
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
