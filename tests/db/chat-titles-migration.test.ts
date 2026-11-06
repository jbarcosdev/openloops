import { ObjectId } from 'mongodb'
import { migrateChatTitles } from '../../src/db'

type Doc = Record<string, any>

function fakeDb (docs: Doc[]) {
    const operations: any[] = []
    const filters: Doc[] = []

    const collection = {
        find: (filter: Doc) => {
            filters.push(filter)
            return (async function* () {
                for (const doc of docs) {
                    if (doc.title) continue
                    const first = doc.messages?.find((message: Doc) => message.role === 'user' && message.source !== 'harness' && !message.excludeFromContext)
                    yield { _id: doc._id, ...(first ? { messages: [first] } : {}) }
                }
            })()
        },
        bulkWrite: async (batch: any[]) => {
            operations.push(...batch)
        },
    }

    return { db: { collection: () => collection } as any, operations, filters }
}

const chat = (messages: Doc[], title?: string) => ({ _id: new ObjectId(), messages, ...(title ? { title } : {}) })

describe('migrateChatTitles', () => {
    it('titles each chat without one with its first message of the user, on one line and cut to 80 characters', async () => {
        const { db, operations } = fakeDb([
            chat([{ role: 'user', content: 'quiero  planear\nun viaje' }, { role: 'assistant', content: 'claro' }]),
            chat([{ role: 'assistant', content: 'hola' }, { role: 'user', content: 'y'.repeat(200) }]),
        ])

        const report = await migrateChatTitles(db)

        expect(report).toEqual({ dryRun: false, titled: 2, skipped: 0 })
        expect(operations[0].updateOne.update).toEqual({ $set: { title: 'quiero planear un viaje' } })
        expect(operations[1].updateOne.update.$set.title).toHaveLength(80)
    })

    it('removes the tags of the message, as the entity does with any text', async () => {
        const { db, operations } = fakeDb([chat([{ role: 'user', content: '<b>negrita</b> hola <script>alert(1)</script>' }])])

        await migrateChatTitles(db)

        expect(operations[0].updateOne.update).toEqual({ $set: { title: 'negrita hola' } })
    })

    it('skips the chats that already have a title and the ones with no message of the user', async () => {
        const { db, operations } = fakeDb([
            chat([{ role: 'user', content: 'hola' }], 'Ya tiene'),
            chat([{ role: 'assistant', content: 'hola' }]),
            chat([{ role: 'user', content: '   ' }]),
            chat([]),
        ])

        const report = await migrateChatTitles(db)

        expect(report).toEqual({ dryRun: false, titled: 0, skipped: 3 })
        expect(operations).toHaveLength(0)
    })

    it('ignores the messages of the harness and the ones excluded from the context', async () => {
        const { db, operations } = fakeDb([
            chat([{ role: 'user', content: 'bloqueado', excludeFromContext: true }, { role: 'user', content: 'auto', source: 'harness' }, { role: 'user', content: 'el bueno' }]),
        ])

        await migrateChatTitles(db)

        expect(operations[0].updateOne.update).toEqual({ $set: { title: 'el bueno' } })
    })

    it('only counts with dryRun and can be run again without writing the same chats twice', async () => {
        const docs = [chat([{ role: 'user', content: 'hola' }])]
        const { db, operations, filters } = fakeDb(docs)

        expect(await migrateChatTitles(db, { dryRun: true })).toEqual({ dryRun: true, titled: 1, skipped: 0 })
        expect(operations).toHaveLength(0)

        await migrateChatTitles(db)
        expect(operations[0].updateOne.filter).toHaveProperty('$or')
        expect(filters[0]).toHaveProperty('deletedAt', null)
    })
})
