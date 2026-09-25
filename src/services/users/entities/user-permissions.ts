export interface UserPermissionsProps {
	notifications?: boolean
	microphone?: boolean
	location?: boolean
	contacts?: boolean
	storage?: boolean
	camera?: boolean
	photos?: boolean
}

export class UserPermissions {
	constructor (
		public notifications?: boolean,
		public microphone?: boolean,
		public location?: boolean,
		public contacts?: boolean,
		public storage?: boolean,
		public camera?: boolean,
		public photos?: boolean,
	) {}

	static fromJSON (props: UserPermissionsProps): UserPermissions {
		return new UserPermissions(props.notifications, props.microphone, props.location, props.contacts, props.storage, props.camera, props.photos)
	}

	toJSON (): UserPermissionsProps {
		return {
			notifications: this.notifications,
			microphone: this.microphone,
			location: this.location,
			contacts: this.contacts,
			storage: this.storage,
			camera: this.camera,
			photos: this.photos,
		}
	}
}
