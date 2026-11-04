import { IndexDescription } from 'mongodb'

export const mcpServers: IndexDescription[] = [
	{ key: { ownerId: 1 } },
	{ key: { name: 1 }, unique: true, partialFilterExpression: { internal: true } },
]
