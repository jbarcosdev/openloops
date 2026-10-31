import { IndexDescription } from 'mongodb'

export const automationRuns: IndexDescription[] = [
	{ key: { automationId: 1, createdAt: -1 } },
	{ key: { ownerId: 1, createdAt: -1 } },
	{ key: { status: 1, createdAt: 1 } },
]
