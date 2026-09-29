export interface ChatSettingsProps {
    notifyOnCompletion?: boolean
    isPrivateSession?: boolean
    modelName?: string,
    loopName?: string,
}

export class ChatSettings {
    constructor (
        private readonly props: ChatSettingsProps,
        public notifyOnCompletion?: boolean,
        public isPrivateSession?: boolean,
        public modelName?: string,
        public loopName?: string,
    ) {}

    static fromJSON (props: ChatSettingsProps) {
        return new ChatSettings(
            props,
            props.notifyOnCompletion,
            props.isPrivateSession,
            props.modelName,
            props.loopName,
        )
    }

    toJSON (): ChatSettingsProps {
        return {
            notifyOnCompletion: this.notifyOnCompletion,
            isPrivateSession: this.isPrivateSession,
            modelName: this.modelName,
            loopName: this.loopName,
        }
    }

    setLoopName (loopName: string): void {
        this.loopName = loopName
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
