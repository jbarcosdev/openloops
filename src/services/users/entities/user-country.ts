import { getCountryNameFromCountryCode } from 'countries-and-currencies-utils'
import { sanitizeString } from '@common/helpers'

export interface CountryProps {
	isoCode?: string
	label?: string
}

export class Country {
	constructor (public isoCode?: string) {}

	get label () {
		return this.isoCode ? getCountryNameFromCountryCode(this.isoCode) : undefined
	}

	static fromJSON (props: CountryProps): Country {
		return new Country(sanitizeString(props.isoCode))
	}

	toJSON (): CountryProps {
		return { isoCode: this.isoCode, label: this.label }
	}
}
