import { Db } from 'mongodb'
import { normalizeTitle } from '../../services/chats/utils/title'

const BATCH_SIZE = 500

export interface ChatTitlesMigrationOptions {
	dryRun?: boolean
}

export interface ChatTitlesMigrationReport {
	dryRun: boolean
	titled: number
	skipped: number
}

const withoutTitle = { $or: [{ title: { $exists: false } }, { title: null }, { title: '' }] }

const firstUserMessage = { role: 'user', source: { $ne: 'harness' }, excludeFromContext: { $ne: true } }

export async function migrateChatTitles (db: Db, options: ChatTitlesMigrationOptions = {}): Promise<ChatTitlesMigrationReport> {
	const dryRun = Boolean(options.dryRun)
	const report: ChatTitlesMigrationReport = { dryRun, titled: 0, skipped: 0 }
	const chats = db.collection('chats')

	let operations: { updateOne: { filter: Record<string, unknown>, update: Record<string, unknown> } }[] = []

	const flush = async () => {
		if (!operations.length) return
		if (!dryRun) await chats.bulkWrite(operations as any, { ordered: false })
		operations = []
	}

	const cursor = chats.find({ ...withoutTitle, deletedAt: null }, { projection: { messages: { $elemMatch: firstUserMessage } } })

	for await (const chat of cursor) {
		const title = normalizeTitle(chat.messages?.[0]?.content)

		if (!title) {
			report.skipped++
			continue
		}

		report.titled++
		operations.push({ updateOne: { filter: { _id: chat._id, ...withoutTitle }, update: { $set: { title } } } })

		if (operations.length >= BATCH_SIZE) await flush()
	}

	await flush()

	return report
}
