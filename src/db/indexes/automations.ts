import { IndexDescription } from 'mongodb'

export const automations: IndexDescription[] = [
	{ key: { 'triggers.schedule.enabled': 1, 'triggers.schedule.nextRunAt': 1 } },
	{ key: { ownerId: 1, createdAt: -1 } },
]
