import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { RevokedToken, RevokedTokenProps } from '../entities'
import { RevokedTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	payload?: Pick<RevokedTokenProps, 'jti' | 'audience' | 'subject' | 'expiresAt'>
}

export type Output = boolean

export class RevokeTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly revokedTokenRepository = new RevokedTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params
		const { jti, audience, subject } = payload ?? {}

		if (!jti || !audience || !subject) this.throwHttpError({ statusCode: 400, errorMessage: 'The jti, the audience and the subject are required to revoke a token' })

		const scope = params.scope ?? Scope.system('revoked tokens are checked by jti, not by owner')
		if (await this.revokedTokenRepository.findByJti(jti, scope)) return false

		try {
			await this.revokedTokenRepository.create(RevokedToken.fromJSON({ jti, audience, subject, expiresAt: payload!.expiresAt, createdBy: currentUser?.userId }), scope)
		} catch (error: any) {
			if (error?.code !== 11000) throw error
			return false
		}

		return true
	}
}
