import { ObjectId } from 'mongodb'
import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'

export interface RefreshTokenProps extends BaseEntityProps {
	userId?: string | ObjectId
	tokenHash?: string
	familyId?: string
	expiresAt?: string | Date
	absoluteExpiresAt?: string | Date
	usedAt?: string | Date | null
	revokedAt?: string | Date | null
	isAdmin?: boolean
}

export class RefreshToken extends BaseEntity {
	constructor (
		props: RefreshTokenProps,
		public userId?: ObjectId,
		public tokenHash?: string,
		public familyId?: string,
		public expiresAt?: Date,
		public absoluteExpiresAt?: Date,
		public usedAt?: Date,
		public revokedAt?: Date,
		public isAdmin?: boolean,
	) {
		super(props)
	}

	static fromJSON (json: RefreshTokenProps): RefreshToken {
		return new RefreshToken(
			json,
			BaseEntity.toObjectId(json.userId),
			BaseEntity.toText(json.tokenHash),
			BaseEntity.toText(json.familyId),
			BaseEntity.toDate(json.expiresAt),
			BaseEntity.toDate(json.absoluteExpiresAt),
			BaseEntity.toDate(json.usedAt ?? undefined),
			BaseEntity.toDate(json.revokedAt ?? undefined),
			json.isAdmin,
		)
	}

	toJSON (): RefreshTokenProps {
		return {
			...super.toJSON(),
			userId: this.userId,
			tokenHash: this.tokenHash,
			familyId: this.familyId,
			expiresAt: this.expiresAt,
			absoluteExpiresAt: this.absoluteExpiresAt,
			usedAt: this.usedAt,
			revokedAt: this.revokedAt,
			isAdmin: this.isAdmin,
		}
	}
}
