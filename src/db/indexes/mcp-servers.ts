import { IndexDescription } from 'mongodb'

export const mcpServers: IndexDescription[] = [
	{ key: { ownerId: 1 } },
]
