import { IndexDescription } from 'mongodb'

export const automations: IndexDescription[] = [
	{ key: { enabled: 1, nextRunAt: 1 } },
	{ key: { ownerId: 1, createdAt: -1 } },
]
