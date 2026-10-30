import { IndexDescription } from 'mongodb'

export const agentTraces: IndexDescription[] = [
	{ key: { ownerId: 1, chatId: 1 } },
]
