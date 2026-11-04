import { createHash } from 'node:crypto'
import jwt, { SignOptions } from 'jsonwebtoken'
import { secretManager } from '@common/utils/secret-manager'

export const TOKEN_ISSUER = 'openloops'
export const SESSION_AUDIENCE = 'session'
export const PASSWORD_RESET_AUDIENCE = 'password-reset'
export const AUTOMATION_EVENT_AUDIENCE = 'automation-event'

export type TokenFailure = 'invalid' | 'expired'

export class TokenError extends Error {
	constructor (readonly reason: TokenFailure) {
		super(`The token is ${reason}`)
		this.name = 'TokenError'
	}
}

export interface TokenClaims {
	sub: string
	iss: string
	aud: string
	iat: number
	exp?: number
	expiresAt?: Date
	jti?: string
	[claim: string]: unknown
}

export interface SignTokenParams {
	audience: string
	subject: string
	expiresIn?: string | number
	jti?: string
	claims?: Record<string, unknown>
}

const DURATION = /^[1-9]\d*[smhdw]$/

const secret = (): string => {
	const value = secretManager.get('JWT_SECRET')
	if (!value) throw new Error('{{jwt_secret_not_found}}')

	return value
}

export function signToken (params: SignTokenParams): { token: string, expiresAt?: Date } {
	const { audience, subject, expiresIn, jti, claims } = params

	if (typeof expiresIn === 'string' && !DURATION.test(expiresIn)) throw new Error('The expiration must be a positive duration such as 30m, 12h, 30d or 2w')

	const token = jwt.sign({ ...claims }, secret(), {
		algorithm: 'HS256',
		issuer: TOKEN_ISSUER,
		audience,
		subject,
		...(jti ? { jwtid: jti } : {}),
		...(expiresIn !== undefined ? { expiresIn: expiresIn as SignOptions['expiresIn'] } : {}),
	})

	const { exp } = jwt.decode(token) as { exp?: number }

	return { token, expiresAt: exp ? new Date(exp * 1000) : undefined }
}

export function verifyToken (token: unknown, audience: string, options: { ignoreExpiration?: boolean } = {}): TokenClaims {
	if (typeof token !== 'string' || !token) throw new TokenError('invalid')

	try {
		const claims = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: TOKEN_ISSUER, audience, ignoreExpiration: options.ignoreExpiration }) as Partial<TokenClaims>

		if (typeof claims.sub !== 'string' || !claims.sub) throw new TokenError('invalid')

		return { ...claims, expiresAt: claims.exp ? new Date(claims.exp * 1000) : undefined } as TokenClaims
	} catch (error: any) {
		if (error instanceof TokenError) throw error
		if (error?.name === 'TokenExpiredError') throw new TokenError('expired')
		if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') throw new TokenError('invalid')

		throw error
	}
}

export interface SessionClaims {
	userId: string
	sessionId?: string
	email?: string
	firstName?: string
	lastName?: string
	exp?: number
}

export function verifySessionToken (token: unknown): SessionClaims {
	const claims = verifyToken(token, SESSION_AUDIENCE)

	return {
		userId: claims.sub,
		sessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
		email: typeof claims.email === 'string' ? claims.email : undefined,
		firstName: typeof claims.firstName === 'string' ? claims.firstName : undefined,
		lastName: typeof claims.lastName === 'string' ? claims.lastName : undefined,
		exp: claims.exp,
	}
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
