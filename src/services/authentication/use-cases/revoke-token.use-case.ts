import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { RevokedToken, RevokedTokenProps } from '../entities'
import { RevokedTokenRepository } from '../repositories'
import { Scope } from '@common/repositories'

export interface Params extends BaseUseCaseParams {
	payload?: Pick<RevokedTokenProps, 'jti' | 'audience' | 'subject' | 'expiresAt'>
}

export interface Output extends BaseUseCaseOutput {
	data: RevokedTokenProps
}

export class RevokeTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly revokedTokenRepository = new RevokedTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!payload?.jti || !payload.audience || !payload.subject) throw new Error('The jti, the audience and the subject are required to revoke a token')

		const scope = params.scope ?? Scope.system('revoked tokens are checked by jti, not by owner')

		const existing = await this.revokedTokenRepository!.findByJti(payload.jti, scope)
		if (existing) return { data: existing }

		const revoked = RevokedToken.fromJSON({ jti: payload.jti, audience: payload.audience, subject: payload.subject, expiresAt: payload.expiresAt, createdBy: currentUser?.userId })

		try {
			await this.revokedTokenRepository!.create(revoked, scope)
		} catch (error: any) {
			if (error?.code !== 11000) throw error
		}

		return { data: revoked.toJSON() }
	}
}
