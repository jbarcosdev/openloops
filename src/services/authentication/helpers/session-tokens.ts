import { randomBytes } from 'node:crypto'
import { UserProps } from '@services/users/entities'
import { CreateRefreshTokenUseCase } from '../use-cases/create-refresh-token.use-case'
import { authConfig } from './auth-config'
import { SESSION_AUDIENCE, hashToken, signToken } from './tokens'

export interface SessionTokens {
	accessToken: string
	refreshToken: string
	expiresIn: number
	refreshExpiresAt: string
}

export type SessionUser = Pick<UserProps, '_id' | 'email' | 'firstName' | 'lastName' | 'role'>

export interface SessionState {
	familyId: string
	absoluteExpiresAt: Date
	isAdmin: boolean
}

export const DAY_MS = 24 * 60 * 60 * 1000

export const createSessionTokens = async (createToken: CreateRefreshTokenUseCase, user: SessionUser, session: SessionState, now: number): Promise<SessionTokens> => {
	const ttlDays = session.isAdmin ? authConfig.adminRefreshTokenTtlDays : authConfig.refreshTokenTtlDays
	const expiresAt = new Date(Math.min(now + ttlDays * DAY_MS, session.absoluteExpiresAt.getTime()))
	const refreshToken = randomBytes(32).toString('base64url')

	await createToken.execute({
		payload: {
			userId: user._id?.toString(),
			tokenHash: hashToken(refreshToken),
			familyId: session.familyId,
			expiresAt,
			absoluteExpiresAt: session.absoluteExpiresAt,
			isAdmin: session.isAdmin,
		},
	})

	const { token } = signToken({
		audience: SESSION_AUDIENCE,
		subject: String(user._id),
		expiresIn: authConfig.accessTokenTtlSeconds,
		claims: { email: user.email, firstName: user.firstName, lastName: user.lastName, sid: session.familyId },
	})

	return {
		accessToken: token,
		refreshToken,
		expiresIn: authConfig.accessTokenTtlSeconds,
		refreshExpiresAt: expiresAt.toISOString(),
	}
}
