import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { revokeToken } from '@services/authentication'
import { AutomationRepository } from '../repositories'
import { EVENT_TOKEN_AUDIENCE, readEventToken } from '../utils/event-token'

export interface Params extends BaseUseCaseParams {
	id: string
	token: string
}

export interface Output extends BaseUseCaseOutput {
	data: { jti: string }
}

@autoInjectable()
export class RevokeAutomationEventTokenUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRepository) private readonly automationRepository?: AutomationRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, token, currentUser } = params

		const automation = await this.automationRepository?.findById(id)
		if (!automation) throw new Error('Automation not found')

		if (!currentUser?.isAdmin() && String(automation.ownerId) !== currentUser?.userId) this.throwError403()

		const claims = readEventToken(token, { ignoreExpiration: true })
		if (claims.sub !== id) throw new Error('The token does not belong to this automation')

		await revokeToken({
			payload: { jti: claims.jti, audience: EVENT_TOKEN_AUDIENCE, subject: id, expiresAt: claims.exp ? new Date(claims.exp * 1000) : undefined },
			currentUser,
		})

		return { data: { jti: claims.jti } }
	}
}
