import { IndexDescription } from 'mongodb'

export const llmCalls: IndexDescription[] = [
	{ key: { ownerId: 1, createdAt: -1 } },
	{ key: { sessionId: 1 } },
	{ key: { answerId: 1 }, sparse: true },
]
