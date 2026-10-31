import { IndexDescription } from 'mongodb'

export const revokedTokens: IndexDescription[] = [
	{ key: { jti: 1 }, unique: true },
	{ key: { expiresAt: 1 }, expireAfterSeconds: 0 },
]
