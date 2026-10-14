import { NotificationPreferences, NotificationPreferencesProps } from './user-notification-preferences'
import { ReportPreferences, ReportPreferencesProps } from './user-report-preferences'
import { Country, CountryProps } from './user-country'
import { Currency, CurrencyProps } from './user-currency'
import { Timezone, TimezoneProps } from './user-timezone'
import { Language, LanguageProps } from './user-language'
import { DefaultModel, DefaultModelProps } from './user-default-model'

export interface UserPreferencesProps {
	notifications?: NotificationPreferencesProps
	reports?: ReportPreferencesProps
	country?: CountryProps
	currency?: CurrencyProps
	timezone?: TimezoneProps
	language?: LanguageProps
	defaultModel?: DefaultModelProps
}

export class UserPreferences {
	constructor (
		public notifications?: NotificationPreferences,
		public reports?: ReportPreferences,
		public country?: Country,
		public currency?: Currency,
		public timezone?: Timezone,
		public language?: Language,
		public defaultModel?: DefaultModel,
	) {}

	static fromJSON (props: UserPreferencesProps): UserPreferences {
		return new UserPreferences(
			props.notifications && NotificationPreferences.fromJSON(props.notifications),
			props.reports && ReportPreferences.fromJSON(props.reports),
			props.country && Country.fromJSON(props.country),
			props.currency && Currency.fromJSON(props.currency),
			props.timezone && Timezone.fromJSON(props.timezone),
			props.language && Language.fromJSON(props.language),
			props.defaultModel && DefaultModel.fromJSON(props.defaultModel),
		)
	}

	toJSON (): UserPreferencesProps {
		return {
			notifications: this.notifications?.toJSON(),
			reports: this.reports?.toJSON(),
			country: this.country?.toJSON(),
			currency: this.currency?.toJSON(),
			timezone: this.timezone?.toJSON(),
			language: this.language?.toJSON(),
			defaultModel: this.defaultModel?.toJSON(),
		}
	}
}
