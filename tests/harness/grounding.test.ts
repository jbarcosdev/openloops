import { ungroundedIdentifiers, opaqueIdentifiers, collectStrings, UNGROUNDED_PHRASE } from '@harness/utils/grounding'
import { newTask, MemoryWorkspace, UnreadableWorkspace, REAL_ID, INVENTED_ID } from '../support'

describe('opaqueIdentifiers', () => {
    it('finds long hex strings with a digit and UUIDs', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000'
        expect(opaqueIdentifiers([`id ${REAL_ID} and ${uuid}`]).sort()).toEqual([REAL_ID, uuid].sort())
    })

    it('ignores plain words, numbers and short hex', () => {
        expect(opaqueIdentifiers(['Belmont Dev Warehouse', '123456', 'deadbeef', 'abcdefabcdefabcdefabcdef'])).toEqual([])
    })
})

describe('collectStrings', () => {
    it('walks nested arguments', () => {
        expect(collectStrings({ name: 'x', arguments: { site: [REAL_ID] } })).toEqual(expect.arrayContaining(['x', REAL_ID]))
    })
})

describe('ungroundedIdentifiers', () => {
    const listingStore = { out_5_1: { items: [{ name: 'Belmont_Dev_Warehouse', wc_site_id: REAL_ID }] } }

    function taskWithListing () {
        const task = newTask({ opening: JSON.stringify({ INPUT: { user_message: `audita el sitio ${REAL_ID.slice(0, 8)}` } }) })
        const listing = task.addAction({ name: 'z__list', args: {}, stepId: '1_1', turn: 1 })
        listing.markCompleted({ structuredContent: { ref: 1 } })
        listing.outputRef = 'out_5_1'
        return task
    }

    it('flags an identifier that appears nowhere', async () => {
        const result = await ungroundedIdentifiers(taskWithListing(), new MemoryWorkspace(listingStore), [INVENTED_ID])
        expect(result).toEqual([INVENTED_ID])
    })

    it('accepts an identifier found in an offloaded result', async () => {
        const result = await ungroundedIdentifiers(taskWithListing(), new MemoryWorkspace(listingStore), [REAL_ID])
        expect(result).toEqual([])
    })

    it('accepts an identifier the user typed in the request', async () => {
        const task = newTask({ opening: JSON.stringify({ INPUT: { user_message: `audita ${INVENTED_ID}` } }) })
        expect(await ungroundedIdentifiers(task, new MemoryWorkspace(), [INVENTED_ID])).toEqual([])
    })

    it('accepts an identifier given by the user in an answer', async () => {
        const task = newTask()
        task.remember([{ key: 'user_answer_1_1', value: `${INVENTED_ID} | in answer to: which one?` }])
        expect(await ungroundedIdentifiers(task, new MemoryWorkspace(), [INVENTED_ID])).toEqual([])
    })

    it('does not accept facts the model learned by itself', async () => {
        const task = newTask()
        task.remember([{ key: 'guess', value: INVENTED_ID }])
        expect(await ungroundedIdentifiers(task, new MemoryWorkspace(), [INVENTED_ID])).toEqual([INVENTED_ID])
    })

    it('does not let its own rejection ground the invented identifier later', async () => {
        const task = newTask()
        const rejected = task.addAction({ name: 'z__audit', args: { site: INVENTED_ID }, stepId: '1_1', turn: 1 })
        rejected.markFailed({ message: `The identifier "${INVENTED_ID}" in the arguments was ${UNGROUNDED_PHRASE}`, retryable: false })

        expect(await ungroundedIdentifiers(task, new MemoryWorkspace(), [INVENTED_ID])).toEqual([INVENTED_ID])
    })

    it('does accept an identifier that a tool error revealed', async () => {
        const task = newTask()
        const failed = task.addAction({ name: 'z__audit', args: {}, stepId: '1_1', turn: 1 })
        failed.markFailed({ message: `Ambiguous. Candidates: [${INVENTED_ID}]`, retryable: false })

        expect(await ungroundedIdentifiers(task, new MemoryWorkspace(), [INVENTED_ID])).toEqual([])
    })

    it('checks the final answer text too', async () => {
        const text = `El sitio ${INVENTED_ID} y ${REAL_ID.toUpperCase()}`
        const result = await ungroundedIdentifiers(taskWithListing(), new MemoryWorkspace(listingStore), [text])
        expect(result).toEqual([INVENTED_ID])
    })

    it('lets the call through when the workspace cannot be read', async () => {
        const result = await ungroundedIdentifiers(taskWithListing(), new UnreadableWorkspace(), [INVENTED_ID])
        expect(result).toEqual([])
    })
})
