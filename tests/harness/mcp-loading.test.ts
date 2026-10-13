import { useHarness, fakeMcp, say, act } from '../support'

const list = (server: string) => act('search_tools', { server })

describe('MCP servers in the agent', () => {
    const env = useHarness()
    let timer: jest.SpyInstance
    let waits: number[]

    beforeEach(() => {
        waits = []
        timer = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
            waits.push(ms ?? 0)
            fn()
            return 0 as any
        }) as any)
    })

    afterEach(() => timer.mockRestore())

    it('lists every server in the index without connecting or declaring its tools', async () => {
        fakeMcp.set([{ name: 'srv', instructions: 'Reads the weather' }, { name: 'new', trust: 'locked' }, { name: 'off', trust: 'blocked' }])
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.opening(0).CONTEXT.mcp_servers).toEqual([
            { name: 'srv', description: 'Reads the weather', state: 'approved' },
            { name: 'new', state: 'not_approved' },
            { name: 'off', state: 'blocked' },
        ])
        expect(env.llm.toolNames(0)).toContain('search_tools')
        expect(env.llm.toolNames(0).some(name => name.includes('__'))).toBe(false)
        expect(fakeMcp.connectAttempts).toEqual({})
    })

    it('has no index and no search tool when the user has no servers', async () => {
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.opening(0).CONTEXT.mcp_servers).toBeUndefined()
        expect(env.llm.toolNames(0)).not.toContain('search_tools')
    })

    it('lists the tools of one server on demand, connecting only that server', async () => {
        fakeMcp.set([{ name: 'srv' }, { name: 'other' }])
        env.llm.script({ actions: [list('srv')] }, say('ok'))
        await env.send(env.agent(), 'hola')

        const [observation] = env.llm.observations(1)
        expect(observation.output.tools.map((tool: any) => tool.name)).toEqual(['srv__ping'])
        expect(fakeMcp.connectAttempts).toEqual({ srv: 1 })
        expect(env.llm.toolNames(1)).toContain('srv__ping')
    })

    it('searches across all the connectable servers when no server is given', async () => {
        fakeMcp.set([{ name: 'a', tools: [{ name: 'weather', description: 'weather forecast' }] }, { name: 'b', tools: [{ name: 'stocks', description: 'stock prices' }] }, { name: 'c', trust: 'blocked' }])
        env.llm.script({ actions: [act('search_tools', { keywords: [{ keyword: 'weather', weight: 1 }] })] }, say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.observations(1)[0].output.tools.map((tool: any) => tool.name)).toEqual(['a__weather'])
        expect(fakeMcp.connectAttempts).toEqual({ a: 1, b: 1 })
    })

    it('refuses to list a blocked server without connecting to it', async () => {
        fakeMcp.set([{ name: 'off', trust: 'blocked' }])
        env.llm.script({ actions: [list('off')] }, say('ok'))
        await env.send(env.agent(), 'hola')

        const [observation] = env.llm.observations(1)
        expect(observation.status).toBe('failed')
        expect(observation.error).toContain('blocked')
        expect(fakeMcp.connectAttempts).toEqual({})
    })

    it('answers an unknown server with the names of the available ones', async () => {
        fakeMcp.set([{ name: 'srv' }])
        env.llm.script({ actions: [list('nope')] }, say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.observations(1)[0].error).toContain('Available servers: srv')
    })

    it('asks for keywords or a server', async () => {
        fakeMcp.set([{ name: 'srv' }])
        env.llm.script({ actions: [act('search_tools', {})] }, say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.observations(1)[0].error).toContain('Pass keywords, or a "server"')
    })

    it('retries a server that fails twice and then connects', async () => {
        fakeMcp.set([{ name: 'flaky', failures: 2 }])
        env.llm.script({ actions: [list('flaky')] }, say('ok'))
        await env.send(env.agent(), 'hola')

        expect(fakeMcp.connectAttempts.flaky).toBe(3)
        expect(waits).toEqual([1000, 2000])
        expect(env.llm.toolNames(1)).toContain('flaky__ping')
        expect(env.llm.opening(1).CONTEXT.unavailable_sources).toBeUndefined()
    })

    it('reports a server that never connects while the others keep working', async () => {
        fakeMcp.set([{ name: 'down', failures: 99 }, { name: 'up' }])
        env.llm.script({ actions: [list('down'), list('up')] }, say('ok'))
        await env.send(env.agent(), 'hola')

        const [failed, listed] = env.llm.observations(1)
        expect(failed.status).toBe('failed')
        expect(failed.error).toContain('unavailable')
        expect(listed.status).toBe('completed')
        expect(env.llm.toolNames(1)).toContain('up__ping')
        expect(env.llm.toolNames(1)).not.toContain('down__ping')
        expect(fakeMcp.connectAttempts.down).toBe(3)
        expect(env.traces().some(trace => String(trace.reasoning).includes('Tool source unavailable: down'))).toBe(true)
    })

    it('reports a failed server listing', async () => {
        fakeMcp.listFails = true
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.opening(0).CONTEXT.unavailable_sources).toEqual(['configured tool servers'])
    })

    it('calls the server tool with the arguments and without the runtime parameters', async () => {
        fakeMcp.set([{ name: 'srv', tools: [{ name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }])
        env.llm.script({ actions: [list('srv')] }, { actions: [act('srv__echo', { text: 'hola' })] }, say('done'))
        await env.send(env.agent(), 'echo')

        expect(fakeMcp.calls).toEqual([{ server: 'srv', tool: 'echo', arguments: { text: 'hola' } }])
    })

    it('turns an error result from the server into a failed observation', async () => {
        fakeMcp.set([{ name: 'srv', tools: [{ name: 'boom', description: 'boom', inputSchema: { type: 'object', properties: {} }, result: () => ({ isError: true, content: [{ type: 'text', text: 'Site not found: x' }] }) }] }])
        env.llm.script({ actions: [list('srv')] }, { actions: [act('srv__boom', {})] }, say('done'))
        await env.send(env.agent(), 'boom')

        const [observation] = env.llm.observations(2)
        expect(observation.status).toBe('failed')
        expect(observation.error).toContain('Site not found: x')
        expect(observation.error).toContain('Harness note')
    })

    it('connects to a server only in the runs that need it', async () => {
        fakeMcp.set([{ name: 'srv' }])
        const agent = env.agent()
        env.llm.script(say('one'))
        const first = await env.send(agent, 'hola')

        env.llm.script(say('two'))
        await env.send(agent, 'otra vez', first.data._id.toString())

        expect(fakeMcp.connectAttempts).toEqual({})
    })
})
