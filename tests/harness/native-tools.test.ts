import { NativeTools, NATIVE_TOOLS } from '@harness/native-tools'
import { NATIVE_TOOL_NAMES } from '@services/tasks/entities/agent-task.entity'
import { newTask, MemoryWorkspace, makeTool } from '../support'
import type { ScoredTool } from '@harness/utils/rank-tools-by-keywords'

const sites = {
    result: {
        items: [
            { name: 'Belmont_Dev_Warehouse', wc_site_id: 'a1' },
            { name: 'Belmont_Dev_Warehouse2', wc_site_id: 'b2' },
            { name: 'Belmont HW System Test DEV', wc_site_id: 'c3' },
            { name: 'Other', wc_site_id: 'd4', tags: ['belmont dev warehouse old'] },
        ],
    },
}

function setup (seed: Record<string, unknown> = {}, ranked: ScoredTool[] = []) {
    const workspace = new MemoryWorkspace(seed)
    const tools = new NativeTools({ workspace, searchTools: () => ranked })
    const task = newTask()
    let step = 0

    const run = async (name: string, args: Record<string, any>) => {
        const action = task.addAction({ name, args, stepId: `${++step}_1`, turn: step })
        await tools.run(task, action)
        return action
    }

    return { workspace, task, run }
}

describe('declared native tools', () => {
    it('match the names the task entity knows', () => {
        expect(NATIVE_TOOLS.map(tool => tool.name)).toEqual(NATIVE_TOOL_NAMES)
    })
})

describe('read_context', () => {
    it('reads a slice of a stored item', async () => {
        const { run } = setup({ big: 'a'.repeat(9000) })
        const action = await run('read_context', { name: 'big', max_chars: 100 })

        expect(action.status).toBe('completed')
        expect(action.output).toMatchObject({ name: 'big', total_chars: 9000, has_more: true })
        expect(action.output.content).toHaveLength(100)
    })

    it('reads inside a path', async () => {
        const { run } = setup({ out_1_1: sites })
        const action = await run('read_context', { name: 'out_1_1', path: 'result.items[0]' })

        expect(action.output.content).toContain('a1')
        expect(action.output.matches).toBeUndefined()
    })

    it('reports a missing path without failing', async () => {
        const { run } = setup({ out_1_1: sites })
        const action = await run('read_context', { name: 'out_1_1', path: 'result.nothing' })

        expect(action.output).toMatchObject({ found: true, path_found: false })
    })

    it('says an item does not exist and lists what does', async () => {
        const { run } = setup({ out_5_1: sites })
        const action = await run('read_context', { name: 'nope' })

        expect(action.output.found).toBe(false)
        expect(action.output.error).toContain('nope')
        expect(action.output.available).toContain('out_5_1')
    })

    it('fails clearly when the name is missing', async () => {
        const { run } = setup()
        const action = await run('read_context', {})

        expect(action.status).toBe('failed')
        expect(action.error?.message).toContain('name')
    })
})

describe('read_context find', () => {
    it('ignores case and separators and returns whole records', async () => {
        const { run } = setup({ out_4_1: sites })
        const { output } = await run('read_context', { name: 'out_4_1', find: 'belmont dev warehouse' })

        expect(output.total_matches).toBe(3)
        expect(output.matches[0].record.wc_site_id).toBe('a1')
        expect(output.matches[1].record.wc_site_id).toBe('b2')
        expect(output.matches[0].path).toBe('result.items[0].name')
    })

    it('falls back to matching all the words', async () => {
        const { run } = setup({ out_4_1: sites })
        const { output } = await run('read_context', { name: 'out_4_1', find: 'hw system dev' })

        expect(output.total_matches).toBe(1)
        expect(output.matches[0].record.wc_site_id).toBe('c3')
    })

    it('gives a hint when nothing matches', async () => {
        const { run } = setup({ out_4_1: sites })
        const { output } = await run('read_context', { name: 'out_4_1', find: 'zzz' })

        expect(output.total_matches).toBe(0)
        expect(output.hint).toBeDefined()
    })

    it('searches inside a path', async () => {
        const { run } = setup({ out_4_1: sites })
        const { output } = await run('read_context', { name: 'out_4_1', path: 'result.items[1]', find: 'warehouse2' })

        expect(output.total_matches).toBe(1)
    })

    it('caps the matches and says so', async () => {
        const many = { rows: Array.from({ length: 50 }, (_, i) => ({ name: `needle ${i}` })) }
        const { run } = setup({ big: many })
        const { output } = await run('read_context', { name: 'big', find: 'needle' })

        expect(output.total_matches).toBe(50)
        expect(output.matches).toHaveLength(20)
        expect(output.note).toContain('20')
    })

    it('cuts very long records', async () => {
        const { run } = setup({ big: { rows: [{ name: 'needle', text: 'x'.repeat(2000) }] } })
        const { output } = await run('read_context', { name: 'big', find: 'needle' })

        expect(typeof output.matches[0].record).toBe('string')
        expect(output.matches[0].record).toHaveLength(600)
    })
})

describe('save_context', () => {
    it('stores structured content and cleans the name', async () => {
        const { run, workspace } = setup()
        const action = await run('save_context', { name: 'my note', content: '{"a":1}', description: 'd' })

        expect(action.output).toEqual({ saved: 'my_note' })
        expect(workspace.items.get('my_note')?.content).toEqual({ a: 1 })
    })

    it('keeps plain text as text', async () => {
        const { run, workspace } = setup()
        await run('save_context', { name: 'text', content: 'just words' })

        expect(workspace.items.get('text')?.content).toBe('just words')
    })
})

describe('search_tools', () => {
    const ranked: ScoredTool[] = [
        { tool: makeTool({ name: 'z__inventory', description: 'sync inventory', required: ['n'], properties: { n: { type: 'string' } } }), score: 3 } as ScoredTool,
    ]

    it('lists the matches without their parameters', async () => {
        const { run } = setup({}, ranked)
        const { output } = await run('search_tools', { keywords: [{ keyword: 'inventory', weight: 1 }] })

        expect(output.tools.map((tool: any) => tool.name)).toEqual(['z__inventory'])
        expect(output.tools[0].parameters).toBeUndefined()
        expect(output.note).toBeDefined()
    })

    it('hints when nothing matches', async () => {
        const { run } = setup()
        const { output } = await run('search_tools', { keywords: ['nothing'] })

        expect(output.tools).toEqual([])
        expect(output.hint).toBeDefined()
    })
})
