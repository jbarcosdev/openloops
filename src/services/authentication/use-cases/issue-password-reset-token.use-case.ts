import { randomUUID } from 'node:crypto'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserProps } from '@services/users/entities'
import { UserRepository } from '@services/users/repositories'
import { authConfig } from '../helpers/auth-config'
import { PASSWORD_RESET_AUDIENCE, signToken } from '../helpers/tokens'

export interface Params extends BaseUseCaseParams {
	payload?: { emailOrUsername?: string }
}

export type Output = { token: string, expiresAt?: Date, user: UserProps } | null

export class IssuePasswordResetTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly userRepository = new UserRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const emailOrUsername = params.payload?.emailOrUsername
		if (typeof emailOrUsername !== 'string' || !emailOrUsername) this.throwHttpError({ statusCode: 400, errorMessage: '{{missing_fields}}' })

		const user = await this.userRepository.findByEmailOrUsernameWithPassword(emailOrUsername, params.scope ?? Scope.system('password reset: the user is not known before the token is issued'))
		if (!user) return null

		const { token, expiresAt } = signToken({ audience: PASSWORD_RESET_AUDIENCE, subject: String(user._id), expiresIn: authConfig.passwordResetTtl, jti: randomUUID() })
		const { password: _password, ...userWithoutPassword } = user.toJSON()

		return { token, expiresAt, user: userWithoutPassword }
	}
}
