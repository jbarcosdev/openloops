import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RefreshToken, RefreshTokenProps } from '../entities'
import { RefreshTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	payload: RefreshTokenProps
}

export class CreateRefreshTokenUseCase extends BaseUseCase<Params, RefreshTokenProps> {
	constructor (private readonly refreshTokenRepository = new RefreshTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<RefreshTokenProps> {
		const token = RefreshToken.fromJSON(params.payload)
		await this.refreshTokenRepository.create(token, params.scope ?? Scope.system('refresh tokens: a session is issued before there is a user in the request'))

		return token.toJSON()
	}
}
