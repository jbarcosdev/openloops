export interface ChatSettingsProps {
    notifyOnCompletion?: boolean
    modelName?: string,
    loopName?: string,
}

export class ChatSettings {
    constructor (
        private readonly props: ChatSettingsProps,
        public notifyOnCompletion?: boolean,
        public modelName?: string,
        public loopName?: string,
    ) {}

    static fromJSON (props: ChatSettingsProps) {
        return new ChatSettings(
            props,
            props.notifyOnCompletion,
            props.modelName,
            props.loopName,
        )
    }

    toJSON (): ChatSettingsProps {
        return {
            notifyOnCompletion: this.notifyOnCompletion,
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
}
