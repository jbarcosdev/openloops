import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RefreshTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	familyId: string
	now: Date
}

export class RevokeRefreshTokenFamilyUseCase extends BaseUseCase<Params, void> {
	constructor (private readonly refreshTokenRepository = new RefreshTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<void> {
		await this.refreshTokenRepository.revokeFamily(params.familyId, params.now, params.scope ?? Scope.system('refresh tokens: a session is revoked by the token, not by a user'))
	}
}
