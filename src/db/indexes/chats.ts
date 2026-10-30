import { IndexDescription } from 'mongodb'

export const chats: IndexDescription[] = [
	{ key: { ownerId: 1, updatedAt: -1 } },
]
