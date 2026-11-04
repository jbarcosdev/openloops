import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { RevokedTokenRepository } from '../repositories'
import { Scope } from '@common/repositories'

export interface Params extends BaseUseCaseParams {
	jti: string
}

export type Output = { revoked: boolean }

export class IsTokenRevokedUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly revokedTokenRepository = new RevokedTokenRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		if (!params.jti) throw new Error('The jti is required')

		const found = await this.revokedTokenRepository!.findByJti(params.jti, params.scope ?? Scope.system('revoked tokens are checked by jti, not by owner'))

		return { revoked: Boolean(found) }
	}
}
