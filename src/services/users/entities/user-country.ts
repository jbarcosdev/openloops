import { getCountry } from 'iso-data'
import { BaseEntity } from '@common/base/base.entity'

export interface CountryProps {
	isoCode?: string
	label?: string
}

export class Country {
	constructor (public isoCode?: string) {}

	get label () {
		return this.isoCode ? getCountry(this.isoCode)?.name : undefined
	}

	static fromJSON (props: CountryProps): Country {
		return new Country(BaseEntity.toText(props.isoCode))
	}

	toJSON (): CountryProps {
		return { isoCode: this.isoCode, label: this.label }
	}
}
