import { IndexDescription } from 'mongodb'

export const agentTasks: IndexDescription[] = [
	{ key: { ownerId: 1, chatId: 1 } },
]
