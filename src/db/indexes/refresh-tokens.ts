import { IndexDescription } from 'mongodb'

export const refreshTokens: IndexDescription[] = [
	{ key: { tokenHash: 1 }, unique: true },
	{ key: { familyId: 1 } },
	{ key: { userId: 1 } },
	{ key: { expiresAt: 1 }, expireAfterSeconds: 24 * 60 * 60 },
]
