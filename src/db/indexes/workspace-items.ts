import { IndexDescription } from 'mongodb'

export const workspaceItems: IndexDescription[] = [
	{ key: { ownerId: 1, chatId: 1 } },
]
