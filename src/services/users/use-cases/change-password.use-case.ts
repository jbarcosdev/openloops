import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RevokeUserRefreshTokensUseCase } from '@services/authentication/use-cases/revoke-user-refresh-tokens.use-case'
import { UserPassword } from '../entities/user-password.value-object'
import { UserRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	password?: string
	sessionId?: string
}

export type Output = void

export class ChangePasswordUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly userRepository = new UserRepository(),
		private readonly revokeUserRefreshTokens = new RevokeUserRefreshTokensUseCase(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, password, sessionId, currentUser } = params

		if (!password || typeof password !== 'string') this.throwHttpError({ statusCode: 400, errorMessage: 'Password is required' })

		const user = await this.userRepository.patchById(id, { set: { password: await UserPassword.create(password) }, unset: {} }, params.scope ?? Scope.canEdit(currentUser))
		if (!user) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		await this.revokeUserRefreshTokens.execute({
			userId: id,
			now: new Date(),
			exceptFamilyId: currentUser?.userId === id ? sessionId : undefined,
		})
	}
}
