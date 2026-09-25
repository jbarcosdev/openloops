export interface NotificationPreferencesProps {
	pushEnabled?: boolean
	emailEnabled?: boolean
}

export class NotificationPreferences {
	constructor (
		public pushEnabled?: boolean,
		public emailEnabled?: boolean,
	) {}

	static fromJSON (props: NotificationPreferencesProps): NotificationPreferences {
		return new NotificationPreferences(props.pushEnabled, props.emailEnabled)
	}

	toJSON (): NotificationPreferencesProps {
		return { pushEnabled: this.pushEnabled, emailEnabled: this.emailEnabled }
	}
}
