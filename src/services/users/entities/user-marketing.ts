import { AdminOnly } from '@common/decorators'
import { sanitizeString } from '@common/helpers'

export interface UserMarketingProps {
	drawNumber?: string
}

export class UserMarketing {
	@AdminOnly
	public readonly drawNumber?: string

	constructor (drawNumber?: string) {
		this.drawNumber = drawNumber
	}

	static fromJSON (props: UserMarketingProps): UserMarketing {
		return new UserMarketing(sanitizeString(props.drawNumber))
	}

	toJSON (): UserMarketingProps {
		return { drawNumber: this.drawNumber }
	}
}
