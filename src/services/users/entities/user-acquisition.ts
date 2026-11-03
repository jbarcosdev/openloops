import { BaseEntity } from '@common/base/base.entity'

export type UserPlatform = 'ios' | 'android' | 'web'

export interface UserAcquisitionProps {
	platform?: UserPlatform
	referrerCode?: string
}

export class UserAcquisition {
	public readonly platform?: UserPlatform

	public readonly referrerCode?: string

	constructor (platform?: UserPlatform, referrerCode?: string) {
		this.platform = platform
		this.referrerCode = referrerCode
	}

	static fromJSON (props: UserAcquisitionProps): UserAcquisition {
		return new UserAcquisition(BaseEntity.toText(props.platform) as UserPlatform, BaseEntity.toText(props.referrerCode))
	}

	toJSON (): UserAcquisitionProps {
		return { platform: this.platform, referrerCode: this.referrerCode }
	}
}
