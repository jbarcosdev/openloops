import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { hashToken } from '../helpers/tokens'
import { FindRefreshTokenByHashUseCase } from './find-refresh-token-by-hash.use-case'
import { RevokeRefreshTokenFamilyUseCase } from './revoke-refresh-token-family.use-case'

export interface Params extends BaseUseCaseParams {
	refreshToken?: string
}

export type Output = void

export class LogoutUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly findToken = new FindRefreshTokenByHashUseCase(),
		private readonly revokeFamily = new RevokeRefreshTokenFamilyUseCase(),
		private readonly now = () => Date.now(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { refreshToken } = params
		if (typeof refreshToken !== 'string' || !refreshToken) return

		const record = await this.findToken.execute({ tokenHash: hashToken(refreshToken) })
		if (record) await this.revokeFamily.execute({ familyId: record.familyId!, now: new Date(this.now()) })
	}
}
