import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { CurrentUser } from '@common/base'
import { ChangePasswordUseCase } from '@services/users/use-cases/change-password.use-case'
import { PASSWORD_RESET_AUDIENCE, TokenError, verifyToken } from '../helpers/tokens'
import { RevokeTokenUseCase } from './revoke-token.use-case'

export interface Params extends BaseUseCaseParams {
	token?: string
	password?: string
}

export type Output = void

export class ResetPasswordUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly changePassword = new ChangePasswordUseCase(),
		private readonly revokeToken = new RevokeTokenUseCase(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { token, password } = params

		if (!password || typeof password !== 'string') this.throwHttpError({ statusCode: 400, errorMessage: 'Password is required' })

		const claims = this.readToken(token)
		const user = claims.jti ? await CurrentUser.asyncFromDB(claims.sub) : undefined
		if (!user?.userId) this.throwError401()

		const isFirstUse = await this.revokeToken.execute({
			payload: { jti: claims.jti, audience: PASSWORD_RESET_AUDIENCE, subject: user.userId, expiresAt: claims.exp ? new Date(claims.exp * 1000) : undefined },
		})
		if (!isFirstUse) this.throwError401()

		await this.changePassword.execute({ id: user.userId, password, currentUser: user })
	}

	private readToken (token?: string) {
		try {
			return verifyToken(token, PASSWORD_RESET_AUDIENCE)
		} catch (error) {
			if (error instanceof TokenError) this.throwError401()
			throw error
		}
	}
}
