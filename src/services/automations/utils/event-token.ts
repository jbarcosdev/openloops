import { randomUUID } from 'node:crypto'
import { AUTOMATION_EVENT_AUDIENCE, TokenError, signToken, verifyToken } from '@services/authentication/helpers/tokens'
import { AutomationEventError } from './automation-event-error'

export interface EventTokenClaims {
	jti: string
	sub: string
	v: number
	expiresAt?: Date
}

export function signEventToken (params: { automationId: string, tokenVersion: number, expiresIn?: string | null }): { token: string, expiresAt?: Date } {
	const { automationId, tokenVersion, expiresIn } = params

	return signToken({
		audience: AUTOMATION_EVENT_AUDIENCE,
		subject: automationId,
		jti: randomUUID(),
		claims: { v: tokenVersion },
		...(expiresIn ? { expiresIn } : {}),
	})
}

export function readEventToken (token: unknown, options: { ignoreExpiration?: boolean } = {}): EventTokenClaims {
	try {
		const claims = verifyToken(token, AUTOMATION_EVENT_AUDIENCE, options)

		if (typeof claims.jti !== 'string' || typeof claims.v !== 'number') throw new TokenError('invalid')

		return { jti: claims.jti, sub: claims.sub, v: claims.v, expiresAt: claims.expiresAt }
	} catch (error: any) {
		if (error instanceof TokenError) throw new AutomationEventError(error.reason)

		throw error
	}
}
