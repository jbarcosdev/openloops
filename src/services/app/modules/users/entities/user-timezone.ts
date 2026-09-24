import { sanitizeString } from '@common/helpers'
import { getTimezoneOffset } from 'countries-and-currencies-utils'

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
		return this.ianaIdentifier ? getTimezoneOffset(this.ianaIdentifier) ?? undefined : undefined
	}

	toJSON (): TimezoneProps {
		return { ianaIdentifier: this.ianaIdentifier, offsetInMinutes: this.offsetInMinutes }
	}
}
