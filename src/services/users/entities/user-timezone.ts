import { sanitizeString } from '@common/helpers'
import { getTimezone } from 'iso-data'

export interface TimezoneProps {
	ianaIdentifier?: string
	offsetInMinutes?: number
}

export class Timezone {
    static fromJSON (props: TimezoneProps): Timezone {
		return new Timezone(sanitizeString(props.ianaIdentifier))
	}

	constructor (public ianaIdentifier?: string) {}

	get offsetInMinutes (): number | undefined {
		return getTimezone(this.ianaIdentifier)?.offset
	}

	toJSON (): TimezoneProps {
		return { ianaIdentifier: this.ianaIdentifier, offsetInMinutes: this.offsetInMinutes }
	}
}
