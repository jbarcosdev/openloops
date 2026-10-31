import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { RevokedToken, RevokedTokenProps } from '../entities'
import { RevokedTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	payload?: Pick<RevokedTokenProps, 'jti' | 'audience' | 'subject' | 'expiresAt'>
}

export interface Output extends BaseUseCaseOutput {
	data: RevokedTokenProps
}

@autoInjectable()
export class RevokeTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(RevokedTokenRepository) private readonly revokedTokenRepository?: RevokedTokenRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		if (!payload?.jti || !payload.audience || !payload.subject) throw new Error('The jti, the audience and the subject are required to revoke a token')

		const existing = await this.revokedTokenRepository!.findByJti(payload.jti)
		if (existing) return { data: existing }

		const revoked = RevokedToken.fromJSON({ jti: payload.jti, audience: payload.audience, subject: payload.subject, expiresAt: payload.expiresAt })
		revoked.setCreatedBy(currentUser)

		try {
			await this.revokedTokenRepository!.create(revoked)
		} catch (error: any) {
			if (error?.code !== 11000) throw error
		}

		return { data: revoked.toJSON() }
	}
}
