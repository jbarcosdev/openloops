import { AdminOnly } from '@common/decorators'
import { sanitizeString } from '@common/helpers'

export type UserPlatform = 'ios' | 'android' | 'web'

export interface UserAcquisitionProps {
	platform?: UserPlatform
	referrerCode?: string
}

export class UserAcquisition {
	public readonly platform?: UserPlatform

	@AdminOnly
	public readonly referrerCode?: string

	constructor (platform?: UserPlatform, referrerCode?: string) {
		this.platform = platform
		this.referrerCode = referrerCode
	}

	static fromJSON (props: UserAcquisitionProps): UserAcquisition {
		return new UserAcquisition(sanitizeString(props.platform) as UserPlatform, sanitizeString(props.referrerCode))
	}

	toJSON (): UserAcquisitionProps {
		return { platform: this.platform, referrerCode: this.referrerCode }
	}
}
