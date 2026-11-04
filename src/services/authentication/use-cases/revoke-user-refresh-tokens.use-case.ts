import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RefreshTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	userId: string
	now: Date
	exceptFamilyId?: string
}

export type Output = void

export class RevokeUserRefreshTokensUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly refreshTokenRepository = new RefreshTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		await this.refreshTokenRepository.revokeUser(params.userId, params.now, params.scope ?? Scope.system('refresh tokens: every session of a user is revoked, also after a password reset without a session'), params.exceptFamilyId)
	}
}
