import { sanitizeString } from '@common/helpers'
import { getLanguage } from 'iso-data'

export interface LanguageProps {
	isoCode?: string
	label?: string
}

export class Language {
	constructor (public isoCode?: string) {}

	get label () {
		return this.isoCode ? getLanguage(this.isoCode)?.nativeName : undefined
	}

	static fromJSON (props: LanguageProps): Language {
		return new Language(sanitizeString(props.isoCode))
	}

	toJSON (): LanguageProps {
		return { isoCode: this.isoCode, label: this.label }
	}
}
