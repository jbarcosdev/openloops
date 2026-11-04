import { MongoRepository, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { RevokedToken, RevokedTokenProps } from '../entities'

export class RevokedTokenRepository {
	public readonly _ = new MongoRepository<RevokedTokenProps>({
		database: getDatabaseName(),
		collection: 'revoked_tokens',
		scoped: true,
	})

	public async create (token: RevokedToken, scope: Scope): Promise<RevokedToken> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: token.toJSON(), scope })
		Object.assign(token, { _id, ownerId, createdAt, createdBy })
		return token
	}

	public async findByJti (jti: string, scope: Scope): Promise<RevokedTokenProps | null> {
		return await this._.findOne({ scope, where: { jti } })
	}
}
