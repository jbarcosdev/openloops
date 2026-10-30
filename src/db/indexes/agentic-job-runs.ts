import { IndexDescription } from 'mongodb'

export const agenticJobRuns: IndexDescription[] = [
	{ key: { jobId: 1, createdAt: -1 } },
	{ key: { ownerId: 1, createdAt: -1 } },
	{ key: { status: 1, createdAt: 1 } },
]
