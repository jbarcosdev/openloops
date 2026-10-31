import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { RevokedTokenRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	jti: string
}

export interface Output extends BaseUseCaseOutput {
	data: { revoked: boolean }
}

@autoInjectable()
export class IsTokenRevokedUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(RevokedTokenRepository) private readonly revokedTokenRepository?: RevokedTokenRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		if (!params.jti) throw new Error('The jti is required')

		const found = await this.revokedTokenRepository!.findByJti(params.jti)

		return { data: { revoked: Boolean(found) } }
	}
}
