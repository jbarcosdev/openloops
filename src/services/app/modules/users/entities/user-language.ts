import { sanitizeString } from '@common/helpers'
import { getLanguageFromLanguageCode } from '@common/helpers'

export interface LanguageProps {
	isoCode?: string
	label?: string
}

export class Language {
	constructor (public isoCode?: string) {}

	get label () {
		return this.isoCode ? getLanguageFromLanguageCode(this.isoCode)?.nativeName : undefined
	}

	static fromJSON (props: LanguageProps): Language {
		return new Language(sanitizeString(props.isoCode))
	}

	toJSON (): LanguageProps {
		return { isoCode: this.isoCode, label: this.label }
	}
}
