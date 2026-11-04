import { MongoRepository, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { RefreshToken, RefreshTokenProps } from '../entities'

export class RefreshTokenRepository {
	public readonly _ = new MongoRepository<RefreshTokenProps>({
		database: getDatabaseName(),
		collection: 'refresh_tokens',
		scoped: true,
		ownerField: 'userId',
	})

	public async create (token: RefreshToken, scope: Scope): Promise<RefreshToken> {
		const { _id, createdAt } = await this._.createOne({ payload: token.toJSON(), scope })
		Object.assign(token, { _id, createdAt })
		return token
	}

	public async findByHash (tokenHash: string, scope: Scope): Promise<RefreshTokenProps | null> {
		return await this._.findOne({ scope, where: { tokenHash } })
	}

	public async claim (tokenHash: string, now: Date, scope: Scope): Promise<RefreshTokenProps | null> {
		return await this._.claimOne({ scope, where: { tokenHash, usedAt: null, revokedAt: null } as any, set: { usedAt: now } })
	}

	public async revokeFamily (familyId: string, now: Date, scope: Scope): Promise<number> {
		return await this._.updateMany({ scope, where: { familyId, revokedAt: null } as any, payload: { revokedAt: now } })
	}

	public async revokeUser (userId: string, now: Date, scope: Scope, exceptFamilyId?: string): Promise<number> {
		const id = this._.parseId(userId)
		if (!id) return 0

		return await this._.updateMany({
			scope,
			where: { userId: id, revokedAt: null, ...(exceptFamilyId ? { familyId: { $ne: exceptFamilyId } } : {}) } as any,
			payload: { revokedAt: now },
		})
	}
}
