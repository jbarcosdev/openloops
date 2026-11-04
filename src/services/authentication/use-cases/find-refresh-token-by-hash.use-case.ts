import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RefreshTokenProps } from '../entities'
import { RefreshTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	tokenHash: string
}

export class FindRefreshTokenByHashUseCase extends BaseUseCase<Params, RefreshTokenProps | null> {
	constructor (private readonly refreshTokenRepository = new RefreshTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<RefreshTokenProps | null> {
		return this.refreshTokenRepository.findByHash(params.tokenHash, params.scope ?? Scope.system('refresh tokens: the token is known only by its hash and there is no user yet'))
	}
}
