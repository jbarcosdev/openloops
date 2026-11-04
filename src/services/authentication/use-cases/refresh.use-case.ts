import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserRepository } from '@services/users/repositories'
import { RefreshTokenProps } from '../entities'
import { authConfig } from '../helpers/auth-config'
import { SessionTokens, createSessionTokens } from '../helpers/session-tokens'
import { hashToken } from '../helpers/tokens'
import { ClaimRefreshTokenUseCase } from './claim-refresh-token.use-case'
import { CreateRefreshTokenUseCase } from './create-refresh-token.use-case'
import { FindRefreshTokenByHashUseCase } from './find-refresh-token-by-hash.use-case'
import { RevokeRefreshTokenFamilyUseCase } from './revoke-refresh-token-family.use-case'

export interface Params extends BaseUseCaseParams {
	refreshToken?: string
}

export type Output = SessionTokens

export class RefreshUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly createToken = new CreateRefreshTokenUseCase(),
		private readonly findToken = new FindRefreshTokenByHashUseCase(),
		private readonly claimToken = new ClaimRefreshTokenUseCase(),
		private readonly revokeFamily = new RevokeRefreshTokenFamilyUseCase(),
		private readonly userRepository = new UserRepository(),
		private readonly now = () => Date.now(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { refreshToken } = params
		if (typeof refreshToken !== 'string' || !refreshToken) this.invalid()

		const now = this.now()
		const tokenHash = hashToken(refreshToken)
		const record = await this.claimToken.execute({ tokenHash, now: new Date(now) }) ?? await this.findRetried(tokenHash, now)

		if (new Date(record.expiresAt!).getTime() <= now || new Date(record.absoluteExpiresAt!).getTime() <= now) this.invalid()

		const user = await this.userRepository.findById(record.userId!.toString(), Scope.system('session: load the user of the refresh token'))

		if (!user) {
			await this.revokeFamily.execute({ familyId: record.familyId!, now: new Date(now) })
			this.invalid()
		}

		return createSessionTokens(this.createToken, user, {
			familyId: record.familyId!,
			absoluteExpiresAt: new Date(record.absoluteExpiresAt!),
			isAdmin: !!record.isAdmin,
		}, now)
	}

	private async findRetried (tokenHash: string, now: number): Promise<RefreshTokenProps> {
		const existing = await this.findToken.execute({ tokenHash })
		if (!existing || existing.revokedAt) this.invalid()

		if (now > new Date(existing.usedAt!).getTime() + authConfig.refreshReuseGraceSeconds * 1000) {
			await this.revokeFamily.execute({ familyId: existing.familyId!, now: new Date(now) })
			this.invalid()
		}

		return existing
	}

	private invalid (): never {
		return this.throwHttpError({ statusCode: 401, errorMessage: '{{invalid_token}}' })
	}
}
