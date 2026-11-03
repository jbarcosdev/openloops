import { BaseEntity } from '@common/base/base.entity'
import { getTimezone } from 'iso-data'

export interface TimezoneProps {
	ianaIdentifier?: string
	offsetInMinutes?: number
}

export class Timezone {
    static fromJSON (props: TimezoneProps): Timezone {
		return new Timezone(BaseEntity.toText(props.ianaIdentifier))
	}

	constructor (public ianaIdentifier?: string) {}

	get offsetInMinutes (): number | undefined {
		return getTimezone(this.ianaIdentifier)?.offset
	}

	toJSON (): TimezoneProps {
		return { ianaIdentifier: this.ianaIdentifier, offsetInMinutes: this.offsetInMinutes }
	}
}
