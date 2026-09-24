import { MaskInLogs, AdminOnly } from '@common/decorators'
import { BaseEntity, BaseEntityProps } from '@common/core/base.entity'
import { getCurrencyDataFromCurrencyCodeAsync } from 'countries-and-currencies-utils'
import { sanitizeString } from '@common/helpers'
import { UserPassword } from './user-password.value-object'
import { UserEmail } from './user-email.value-object'
import { UserPreferences, UserPreferencesProps } from './user-preferences'
import { UserPermissions, UserPermissionsProps } from './user-permissions'
import { UserAcquisition, UserAcquisitionProps } from './user-acquisition'
import { UserMarketing, UserMarketingProps } from './user-marketing'

export enum UserRole {
	ADMIN = 'admin',
	AGENT = 'agent',
	GUEST = 'guest',
	USER = 'user',
}

export interface UserProps extends BaseEntityProps {
	firstName?: string
	middleName?: string
	lastName?: string
	email?: string
	password?: string
	role?: UserRole
	acquisition?: UserAcquisitionProps
	marketing?: UserMarketingProps
	preferences?: UserPreferencesProps
	permissions?: UserPermissionsProps
}

export class User extends BaseEntity {
	@MaskInLogs
	public password?: string

	@AdminOnly
	public role?: UserRole

	constructor (
		public readonly props: UserProps,
		public firstName?: string,
		public lastName?: string,
		public email?: string,
		password?: string,
		role?: UserRole,
		public acquisition?: UserAcquisition,
		public marketing?: UserMarketing,
		public preferences?: UserPreferences,
		public permissions?: UserPermissions,
	) {
		super(props)
		this.password = password
		this.role = role
	}

	static fromJSON (json: UserProps) {
		return new User(
			json,
			sanitizeString(json.firstName),
			sanitizeString(json.lastName),
			UserEmail.create(json.email),
			json.password,
			sanitizeString(json.role) as UserRole,
			json.acquisition && UserAcquisition.fromJSON(json.acquisition),
			json.marketing && UserMarketing.fromJSON(json.marketing),
			json.preferences && UserPreferences.fromJSON(json.preferences),
			json.permissions && UserPermissions.fromJSON(json.permissions),
		)
	}

	toJSON (): UserProps {
		return {
			...super.toJSON(),
			firstName: this.firstName,
			lastName: this.lastName,
			email: this.email,
			password: this.password,
			role: this.role,
			acquisition: this.acquisition?.toJSON(),
			marketing: this.marketing?.toJSON(),
			preferences: this.preferences?.toJSON(),
			permissions: this.permissions?.toJSON(),
		}
	}

	static async create (props: UserProps): Promise<User> {
		if (props.preferences?.currency?.isoCode) {
			const currencyData = await getCurrencyDataFromCurrencyCodeAsync(props.preferences.currency.isoCode)
			props.preferences.currency.label = currencyData?.label
			props.preferences.currency.symbol = currencyData?.symbol
		}

		if (props.password && !UserPassword.isHashed(props.password)) {
			props.password = await UserPassword.create(props.password)
		}

		const user = User.fromJSON(props)
		user.role = user.role || UserRole.USER
		return user
	}

	get fullName (): string {
		return `${this.firstName} ${this.lastName}`
	}

	public async verifyPassword (password: string) : Promise<boolean> {
		return UserPassword.compare(password, String(this.password))
	}
}
