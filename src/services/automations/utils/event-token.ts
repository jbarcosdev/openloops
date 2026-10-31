import { randomUUID } from 'node:crypto'
import jwt, { SignOptions } from 'jsonwebtoken'
import { secretManager } from '@common/utils/secret-manager'
import { AutomationEventError } from './automation-event-error'

export const EVENT_TOKEN_AUDIENCE = 'automation-event'

const DURATION = /^[1-9]\d*[smhdw]$/

export interface EventTokenClaims {
	jti: string
	sub: string
	v: number
	exp?: number
}

const secret = (): string => {
	const value = secretManager.get('JWT_SECRET')
	if (!value) throw new Error('{{jwt_secret_not_found}}')

	return value
}

export function signEventToken (params: { automationId: string, tokenVersion: number, expiresIn?: string | null }): { token: string, expiresAt?: Date } {
	const { automationId, tokenVersion, expiresIn } = params

	if (expiresIn && !DURATION.test(expiresIn)) throw new Error('The expiration must be a positive duration such as 30m, 12h, 30d or 2w')

	const token = jwt.sign({ v: tokenVersion }, secret(), {
		algorithm: 'HS256',
		audience: EVENT_TOKEN_AUDIENCE,
		subject: automationId,
		jwtid: randomUUID(),
		...(expiresIn ? { expiresIn: expiresIn as SignOptions['expiresIn'] } : {}),
	})

	const { exp } = jwt.decode(token) as { exp?: number }

	return { token, expiresAt: exp ? new Date(exp * 1000) : undefined }
}

export function readEventToken (token: unknown, options: { ignoreExpiration?: boolean } = {}): EventTokenClaims {
	if (typeof token !== 'string' || !token) throw new AutomationEventError('invalid')

	try {
		const claims = jwt.verify(token, secret(), { algorithms: ['HS256'], audience: EVENT_TOKEN_AUDIENCE, ignoreExpiration: options.ignoreExpiration }) as Partial<EventTokenClaims>

		if (typeof claims.jti !== 'string' || typeof claims.sub !== 'string' || typeof claims.v !== 'number') throw new AutomationEventError('invalid')

		return { jti: claims.jti, sub: claims.sub, v: claims.v, exp: claims.exp }
	} catch (error: any) {
		if (error instanceof AutomationEventError) throw error
		if (error?.name === 'TokenExpiredError') throw new AutomationEventError('expired')
		if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') throw new AutomationEventError('invalid')

		throw error
	}
}
