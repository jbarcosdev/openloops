import { IndexDescription } from 'mongodb'

export const agenticJobs: IndexDescription[] = [
	{ key: { enabled: 1, nextRunAt: 1 } },
	{ key: { ownerId: 1, createdAt: -1 } },
]
