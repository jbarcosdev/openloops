import { BaseEntity } from '@common/base/base.entity'

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
		return new Currency(BaseEntity.toText(props.isoCode), BaseEntity.toText(props.label), BaseEntity.toText(props.symbol))
	}

	toJSON (): CurrencyProps {
		return { isoCode: this.isoCode, label: this.label, symbol: this.symbol }
	}
}
