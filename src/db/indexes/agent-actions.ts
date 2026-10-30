import { IndexDescription } from 'mongodb'

export const agentActions: IndexDescription[] = [
	{ key: { ownerId: 1, taskId: 1 } },
]
