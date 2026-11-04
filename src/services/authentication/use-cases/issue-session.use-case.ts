import { randomUUID } from 'node:crypto'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { authConfig } from '../helpers/auth-config'
import { DAY_MS, SessionTokens, SessionUser, createSessionTokens } from '../helpers/session-tokens'
import { CreateRefreshTokenUseCase } from './create-refresh-token.use-case'

export interface Params extends BaseUseCaseParams {
	user: SessionUser
}

export type Output = SessionTokens

export class IssueSessionUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly createToken = new CreateRefreshTokenUseCase(),
		private readonly now = () => Date.now(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { user } = params
		const isAdmin = user.role === 'admin'
		const maxAgeDays = isAdmin ? authConfig.adminRefreshTokenMaxAgeDays : authConfig.refreshTokenMaxAgeDays
		const now = this.now()

		return createSessionTokens(this.createToken, user, { familyId: randomUUID(), absoluteExpiresAt: new Date(now + maxAgeDays * DAY_MS), isAdmin }, now)
	}
}
