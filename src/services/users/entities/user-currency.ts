import { sanitizeString } from '@common/helpers'

export interface CurrencyProps {
	isoCode?: string
	label?: string
	symbol?: string
}

export class Currency {
	constructor (
		public isoCode?: string,
		public label?: string,
		public symbol?: string,
	) {}

	static fromJSON (props: CurrencyProps): Currency {
		return new Currency(sanitizeString(props.isoCode), sanitizeString(props.label), sanitizeString(props.symbol))
	}

	toJSON (): CurrencyProps {
		return { isoCode: this.isoCode, label: this.label, symbol: this.symbol }
	}
}
