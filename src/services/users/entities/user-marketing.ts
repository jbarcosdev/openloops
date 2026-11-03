import { BaseEntity } from '@common/base/base.entity'

export interface UserMarketingProps {
	drawNumber?: string
}

export class UserMarketing {
	public readonly drawNumber?: string

	constructor (drawNumber?: string) {
		this.drawNumber = drawNumber
	}

	static fromJSON (props: UserMarketingProps): UserMarketing {
		return new UserMarketing(BaseEntity.toText(props.drawNumber))
	}

	toJSON (): UserMarketingProps {
		return { drawNumber: this.drawNumber }
	}
}
