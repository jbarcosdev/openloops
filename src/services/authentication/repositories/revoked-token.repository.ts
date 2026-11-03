import { autoInjectable } from 'tsyringe'
import { MongoRepository } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { RevokedToken, RevokedTokenProps } from '../entities'

@autoInjectable()
export class RevokedTokenRepository {
	public readonly _ = new MongoRepository<RevokedTokenProps>({
		database: getDatabaseName(),
		collection: 'revoked_tokens',
	})

	public async create (token: RevokedToken): Promise<RevokedToken> {
		const { _id } = await this._.createOne({ payload: token.toDocument() })
		token.setId(_id)
		return token
	}

	public async findByJti (jti: string): Promise<RevokedTokenProps | null> {
		return await this._.findOne({ where: { jti } })
	}
}
