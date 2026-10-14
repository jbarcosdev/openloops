import jwt from 'jsonwebtoken'
import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { User, UserProps, UserRole } from '@services/users/entities'
import { UserRepository } from '@services/users/repositories'
import { CurrentUser } from '@common/base'

export interface Params extends BaseUseCaseParams {
	payload: {
		emailOrUsername: string
		password: string
	}
}

export interface Output extends BaseUseCaseOutput {
	data: {
		token: string
		user: UserProps
	}
}

@autoInjectable()
export class LoginUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly userRepository: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const SECRET_KEY = this.secretManager.get('JWT_SECRET')
		if (!SECRET_KEY) throw new Error('{{jwt_secret_not_found}}')

		const { payload } = params

		const { emailOrUsername, password } = payload
		const user: User | null = await this.userRepository.findByEmailOrUsernameWithPassword(emailOrUsername)
		if (!user) {
			return this.throwHttpError({
				statusCode: 404,
				errorMessage: `{{user_not_found}}: ${emailOrUsername}`,
			}) as any
		}

		const isValidPassword = await user.verifyPassword(password)
		if (isValidPassword !== true) {
			return this.throwHttpError({
				statusCode: 401,
				errorMessage: '{{invalid_password}}',
			}) as any
		}

		const expiresIn = user.role === UserRole.ADMIN ? '1h' : '7d'

		const payloadData: Partial<CurrentUser> = {
			userId: user._id?.toString(),
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
		}

		const token = jwt.sign(payloadData, SECRET_KEY, { expiresIn: expiresIn })

		const { password: _password, ...userWithoutPassword } = user.toJSON()
		return { data: { token, user: userWithoutPassword } }
	}
}
