import { randomUUID } from 'node:crypto'
import { AUTOMATION_EVENT_AUDIENCE, TokenError, signToken, verifyToken } from '@services/authentication/helpers/tokens'
import { AutomationEventError } from './automation-event-error'

export const EVENT_TOKEN_AUDIENCE = AUTOMATION_EVENT_AUDIENCE

const DURATION = /^[1-9]\d*[smhdw]$/

export interface EventTokenClaims {
	jti: string
	sub: string
	v: number
	exp?: number
}

export function signEventToken (params: { automationId: string, tokenVersion: number, expiresIn?: string | null }): { token: string, expiresAt?: Date } {
	const { automationId, tokenVersion, expiresIn } = params

	if (expiresIn && !DURATION.test(expiresIn)) throw new Error('The expiration must be a positive duration such as 30m, 12h, 30d or 2w')

	return signToken({
		audience: EVENT_TOKEN_AUDIENCE,
		subject: automationId,
		jti: randomUUID(),
		claims: { v: tokenVersion },
		...(expiresIn ? { expiresIn } : {}),
	})
}

export function readEventToken (token: unknown, options: { ignoreExpiration?: boolean } = {}): EventTokenClaims {
	try {
		const claims = verifyToken(token, EVENT_TOKEN_AUDIENCE, options)

		if (typeof claims.jti !== 'string' || typeof claims.v !== 'number') throw new TokenError('invalid')

		return { jti: claims.jti, sub: claims.sub, v: claims.v, exp: claims.exp }
	} catch (error: any) {
		if (error instanceof TokenError) throw new AutomationEventError(error.reason)

		throw error
	}
}
