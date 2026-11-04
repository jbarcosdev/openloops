import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { revokeToken } from '@services/authentication'
import { AutomationRepository } from '../repositories'
import { EVENT_TOKEN_AUDIENCE, readEventToken } from '../utils/event-token'

export interface Params extends BaseUseCaseParams {
	id: string
	token: string
}

export type Output = { jti: string }

export class RevokeAutomationEventTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRepository = new AutomationRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, token, currentUser } = params

		const automation = await this.automationRepository.findById(id, params.scope ?? Scope.canManage(currentUser))
		if (!automation) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		const claims = readEventToken(token, { ignoreExpiration: true })
		if (claims.sub !== id) throw new Error('The token does not belong to this automation')

		await revokeToken({
			payload: { jti: claims.jti, audience: EVENT_TOKEN_AUDIENCE, subject: id, expiresAt: claims.exp ? new Date(claims.exp * 1000) : undefined },
			currentUser,
		})

		return { jti: claims.jti }
	}
}
