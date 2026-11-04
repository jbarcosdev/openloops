import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserProps } from '@services/users/entities'
import { UserPassword } from '@services/users/entities/user-password.value-object'
import { UserRepository } from '@services/users/repositories'
import { SessionTokens } from '../helpers/session-tokens'
import { IssueSessionUseCase } from './issue-session.use-case'

const DUMMY_PASSWORD_HASH = '$2b$10$Ght7KzqDJGfF.DqpStMliepgL1i.91CiIyAyqfHOzWlwGe5ipCrl6'

export interface Params extends BaseUseCaseParams {
	payload?: {
		emailOrUsername?: string
		password?: string
	}
}

export type Output = SessionTokens & { user: UserProps }

export class LoginUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly userRepository = new UserRepository(),
		private readonly issueSession = new IssueSessionUseCase(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { emailOrUsername, password } = params.payload ?? {}

		if (typeof emailOrUsername !== 'string' || typeof password !== 'string' || !emailOrUsername || !password) {
			this.throwHttpError({ statusCode: 400, errorMessage: '{{missing_fields}}' })
		}

		const user = await this.userRepository.findByEmailOrUsernameWithPassword(emailOrUsername, params.scope ?? Scope.system('login: the user is not known before the credentials are checked'))
		const isValidPassword = user ? await user.verifyPassword(password) : await UserPassword.compare(password, DUMMY_PASSWORD_HASH)

		if (!user || !isValidPassword) this.throwHttpError({ statusCode: 401, errorMessage: '{{invalid_credentials}}' })

		const tokens = await this.issueSession.execute({ user })
		const { password: _password, ...userWithoutPassword } = user.toJSON()

		return { ...tokens, user: userWithoutPassword }
	}
}
