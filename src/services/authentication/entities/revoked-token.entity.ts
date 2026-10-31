import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export interface RevokedTokenProps extends BaseEntityProps {
	jti?: string
	audience?: string
	subject?: string
	expiresAt?: string | Date
}

const toDate = (value?: string | Date): Date | undefined => {
	if (!value) return undefined

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) throw new Error('{{value_must_be_a_date}}')

	return date
}

export class RevokedToken extends BaseEntity {
	static fromJSON (props: RevokedTokenProps): RevokedToken {
		return new RevokedToken(
			props,
			props.jti || undefined,
			props.audience || undefined,
			props.subject || undefined,
			toDate(props.expiresAt),
		)
	}

	constructor (
		private readonly props: RevokedTokenProps,
		public jti?: string,
		public audience?: string,
		public subject?: string,
		public expiresAt?: Date,
	) {
		super(props)
	}

	toJSON (): RevokedTokenProps {
		return {
			...super.toJSON(),
			jti: this.jti,
			audience: this.audience,
			subject: this.subject,
			expiresAt: this.expiresAt,
		}
	}
}
