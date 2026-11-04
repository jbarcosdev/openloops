import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RefreshTokenProps } from '../entities'
import { RefreshTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	tokenHash: string
	now: Date
}

export class ClaimRefreshTokenUseCase extends BaseUseCase<Params, RefreshTokenProps | null> {
	constructor (private readonly refreshTokenRepository = new RefreshTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<RefreshTokenProps | null> {
		return this.refreshTokenRepository.claim(params.tokenHash, params.now, params.scope ?? Scope.system('refresh tokens: a token is used once to renew the session and there is no user yet'))
	}
}
