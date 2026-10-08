import { ObjectId } from 'mongodb'
import { ToolPipeline } from '@harness/tool-pipeline'
import type { Tool } from '@tools/tool'
import { newTask, makeTool, structured, bigListing, MemoryWorkspace, REAL_ID, INVENTED_ID } from '../support'

const logger: any = { error () {}, debug () {}, warn () {}, info () {} }

function build (tools: Tool[], workspace = new MemoryWorkspace(), options?: ConstructorParameters<typeof ToolPipeline>[1]) {
    const pipeline = new ToolPipeline({
        workspace,
        tools: () => tools,
        searchTools: () => [],
        baseParams: { answerId: new ObjectId().toString(), sessionId: 's', currentUser: undefined as any },
        logger,
    }, options)
    const task = newTask()
    let step = 0
    const run = async (name: string, args: Record<string, any> = {}, opts?: Parameters<ToolPipeline['run']>[2]) => {
        const action = task.addAction({ name, args, stepId: `${++step}_1`, turn: step })
        return pipeline.run(task, action, opts)
    }
    return { pipeline, task, workspace, run }
}

describe('duplicates and failed calls', () => {
    const reader = makeTool({ name: 'r', properties: { q: { type: 'string' } }, handler: async () => ({ v: 1 }) })

    it('blocks an identical call that already completed', async () => {
        const { run } = build([reader])
        expect((await run('r', { q: 'x' })).status).toBe('completed')

        const second = await run('r', { q: 'x' })
        expect(second.status).toBe('failed')
        expect(second.error?.message).toContain('already completed')
        expect(second.error?.retryable).toBe(false)
    })

    it('allows duplicates when the loop turns the guard off', async () => {
        const { run } = build([reader])
        await run('r', { q: 'x' })
        expect((await run('r', { q: 'x' }, { blockDuplicates: false })).status).toBe('completed')
    })

    it('does not run again a call that failed with a real error', async () => {
        let calls = 0
        const broken = makeTool({ name: 'broken', handler: async () => { calls++; throw new Error('Ambiguous site name') } })
        const { run } = build([broken])

        await run('broken', { site: 'x' })
        const again = await run('broken', { site: 'x' })

        expect(calls).toBe(1)
        expect(again.error?.message).toContain('already failed')
        expect(again.error?.message).toContain('Ambiguous site name')
    })

    it('lets a transient failure be retried', async () => {
        let calls = 0
        const flaky = makeTool({ name: 'flaky', handler: async () => { calls++; throw new Error('503 service unavailable') } })
        const { run } = build([flaky])

        await run('flaky', {})
        const again = await run('flaky', {})

        expect(calls).toBe(2)
        expect(again.error?.message).not.toContain('already failed')
    })

    it('fails unresolved references before running anything', async () => {
        let calls = 0
        const tool = makeTool({ name: 'r2', properties: { q: { type: 'string' } }, handler: async () => { calls++; return {} } })
        const { run } = build([tool])
        const action = await run('r2', { q: '{{step_9.output.z}}' })

        expect(action.status).toBe('failed')
        expect(action.error?.message).toContain('Unresolved')
        expect(calls).toBe(0)
    })
})

describe('arguments are checked against the schema', () => {
    it('reports missing and mistyped arguments', async () => {
        const tool = makeTool({ name: 'typed', required: ['id'], properties: { id: { type: 'string' } } })
        const { run } = build([tool])

        expect((await run('typed', {})).error?.message).toContain('Missing required argument')
        expect((await run('typed', { id: 5 })).error?.message).toContain('must be of type string')
    })
})

describe('destructive tools', () => {
    const wipe = makeTool({ name: 'wipe', destructive: true })

    it('refuse to run without approval', async () => {
        const { run, pipeline, task } = build([wipe])
        const action = await run('wipe')

        expect(action.status).toBe('failed')
        expect(action.error?.message).toContain('confirmation')
        expect(pipeline.requiresApproval(task.addAction({ name: 'wipe', args: {}, stepId: '9_1', turn: 9 }))).toBe(true)
    })

    it('run once approved', async () => {
        const { pipeline, task } = build([wipe])
        const action = task.addAction({ name: 'wipe', args: {}, stepId: '1_1', turn: 1 })
        action.approve()

        expect(pipeline.requiresApproval(action)).toBe(false)
        expect((await pipeline.run(task, action)).status).toBe('completed')
    })
})

describe('notes appended to errors', () => {
    const failing = (message: string) => makeTool({ name: 'f', handler: async () => { throw new Error(message) } })

    it('adds a directive note to a not found error', async () => {
        const { run } = build([failing("Site not found: 'x'. Did you mean: ['Y']?")])
        const action = await run('f')

        expect(action.error?.message).toContain("Did you mean: ['Y']")
        expect(action.error?.message).toContain('Harness note')
        expect(action.error?.message).toContain('Do not ask the user whether the name is correct')
    })

    it('adds a schema note to validation errors from the server', async () => {
        const { run } = build([failing('2 validation errors for call[x]\nsite\n  Missing required argument')])
        const action = await run('f')

        expect(action.error?.message).toContain('misnamed version of a missing one')
    })

    it('adds its own note to ambiguity errors', async () => {
        const { run } = build([failing("AMBIGUOUS_SITE: 2 sites match 'x'. Candidates: [a, b]")])
        const message = (await run('f')).error?.message

        expect(message).toContain('even an exact name can be ambiguous')
        expect(message).not.toContain('misnamed')
    })
})

describe('unknown tool names', () => {
    it('points to the full name when only the prefix is missing', async () => {
        const { run } = build([makeTool({ name: 'srv__get_site' })])
        const message = (await run('get_site')).error?.message

        expect(message).toContain('"srv__get_site"')
    })

    it('shows how to call a hidden tool through the invoker without repeating the prefix', async () => {
        const invoker = makeTool({ name: 'z__invoke_tool', required: ['name', 'arguments'], properties: { name: { type: 'string' }, arguments: { type: 'object' } } })
        const { run } = build([invoker])
        const message = (await run('z__run_site_audit')).error?.message ?? ''

        expect(message).toContain('hidden tool')
        expect(message).toContain('"name":"run_site_audit"')
        expect(message).not.toContain('"name":"z__run_site_audit"')
    })

    it('tells the model to use exact names when there is no invoker', async () => {
        const { run } = build([makeTool({ name: 'a' })])
        expect((await run('nope')).error?.message).toContain('exact tool names')
    })
})

describe('search_tools availability', () => {
    it('is refused when every tool is already listed', async () => {
        const { run } = build([makeTool({ name: 'a' })])
        const action = await run('search_tools', { keywords: ['a'] })

        expect(action.status).toBe('failed')
        expect(action.error?.message).toContain('not in your tool list')
    })

    it('names the server search tool when one exists', async () => {
        const { run } = build([makeTool({ name: 'srv__search_tools' })])
        expect((await run('search_tools', {})).error?.message).toContain('srv__search_tools')
    })
})

describe('output size handling', () => {
    const lister = (size: number) => makeTool({ name: 'lister', handler: async () => structured(bigListing(size)) })

    it('keeps a small output as it is', async () => {
        const { run, workspace } = build([makeTool({ name: 'small', handler: async () => ({ ok: true }) })])
        const action = await run('small')

        expect(action.outputRef).toBeUndefined()
        expect(workspace.items.size).toBe(0)
    })

    it('stores a medium output and keeps the content with a stub for later', async () => {
        const { run, workspace } = build([lister(300)])
        const action = await run('lister')

        expect(action.outputRef).toBe('out_1_1')
        expect(action.outputStub?.workspace_ref).toBe('out_1_1')
        expect(action.observationOutput(false, 3000).results).toHaveLength(300)
        expect(action.observationOutput(true, 3000).workspace_ref).toBe('out_1_1')
        expect(workspace.items.get('out_1_1')?.kind).toBe('tool_output')
    })

    it('replaces a huge output by the stub and keeps it whole in the workspace', async () => {
        const { run, workspace } = build([lister(3000)])
        const action = await run('lister')

        expect(action.outputStub).toBeUndefined()
        expect(action.output.workspace_ref).toBe('out_1_1')
        expect(action.output.note).toContain('Partial view')
        expect(action.output.note).toContain('name "out_1_1"')
        expect(action.output.note).toContain('find')
        expect(action.output.outline).toBeDefined()
        expect(JSON.stringify(action).length).toBeLessThan(6000)
        expect((workspace.items.get('out_1_1')?.content as any).results).toHaveLength(3000)
    })

    it('honors custom thresholds', async () => {
        const { run } = build([makeTool({ name: 'mid', handler: async () => ({ text: 'x'.repeat(600) }) })], new MemoryWorkspace(), { stubThresholdChars: 100, offloadThresholdChars: 300 })
        const action = await run('mid')

        expect(action.output.workspace_ref).toBe('out_1_1')
    })

    it('marks items truncated when they exceed the storage cap', async () => {
        const { run, workspace } = build([makeTool({ name: 'mid', handler: async () => ({ text: 'x'.repeat(600) }) })], new MemoryWorkspace(), { stubThresholdChars: 100, offloadThresholdChars: 300, maxStoredChars: 200 })
        await run('mid')

        expect(workspace.items.get('out_1_1')?.truncated).toBe(true)
    })

    it('survives a workspace that cannot save', async () => {
        const workspace = new MemoryWorkspace()
        workspace.save = async () => { throw new Error('disk full') }
        const { run } = build([makeTool({ name: 'huge', handler: async () => ({ text: 'x'.repeat(150000) }) })], workspace)
        const action = await run('huge')

        expect(action.status).toBe('completed')
        expect(action.output.truncated).toBe(true)
    })

    it('lets later calls reference an offloaded output', async () => {
        const getter = makeTool({ name: 'get', required: ['id'], properties: { id: { type: 'string' } }, handler: async (params) => ({ got: params.id }) })
        const { run } = build([lister(3000), getter])

        await run('lister')
        const action = await run('get', { id: '{{step_1_1.output.results[3].id}}' })

        expect(action.output).toEqual({ got: 'id3' })
    })
})

describe('schemas seen in results', () => {
    it('are learned from tool listings', async () => {
        const finder = makeTool({
            name: 'srv__find',
            handler: async () => structured({
                tools: [
                    { name: 'get_health', description: 'd', input_schema: { type: 'object', properties: { site: { type: 'string' }, hours: { anyOf: [{ type: 'number' }, { type: 'null' }] } }, required: ['site'] } },
                    { name: 'no_schema', description: 'd' },
                ],
            }),
        })
        const { run, task } = build([finder])
        await run('srv__find')

        expect(task.schemas).toEqual({ get_health: { required: ['site (string)'], optional: ['hours (number)'] } })
    })
})

describe('identifiers in arguments', () => {
    const audit = makeTool({ name: 'z__audit', properties: { site: { type: 'string' }, page: { type: 'number' } } })

    function withListing () {
        const workspace = new MemoryWorkspace({ out_5_1: { items: [{ name: 'Belmont_Dev_Warehouse', wc_site_id: REAL_ID }] } })
        const built = build([audit], workspace)
        const listing = built.task.addAction({ name: 'z__list', args: {}, stepId: '0_1', turn: 0 })
        listing.markCompleted({ structuredContent: { ref: 1 } })
        listing.outputRef = 'out_5_1'
        return built
    }

    it('blocks an invented identifier', async () => {
        const { run } = withListing()
        const action = await run('z__audit', { site: INVENTED_ID })

        expect(action.status).toBe('failed')
        expect(action.error?.message).toContain(INVENTED_ID)
        expect(action.error?.message).toContain('invented')
        expect(action.error?.message).toContain("not found in the user's messages")
    })

    it('runs when the identifier comes from an offloaded result', async () => {
        const { run } = withListing()
        expect((await run('z__audit', { site: REAL_ID })).status).toBe('completed')
    })

    it('does not check names or numbers', async () => {
        const { run } = withListing()
        expect((await run('z__audit', { site: 'Belmont Dev Warehouse', page: 1 })).status).toBe('completed')
    })
})
