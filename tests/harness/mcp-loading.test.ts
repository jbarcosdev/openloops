import { useHarness, fakeMcp, say, act } from '../support'

describe('MCP loading in the agent', () => {
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

    it('adds the tools of a server with the server name as prefix', async () => {
        fakeMcp.set([{ name: 'srv' }])
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.toolNames(0)).toContain('srv__ping')
        expect(env.llm.opening(0).CONTEXT.unavailable_sources).toBeUndefined()
        expect(waits).toEqual([])
    })

    it('retries a server that fails twice and then connects', async () => {
        fakeMcp.set([{ name: 'flaky', failures: 2 }])
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(fakeMcp.connectAttempts.flaky).toBe(3)
        expect(waits).toEqual([1000, 2000])
        expect(env.llm.toolNames(0)).toContain('flaky__ping')
        expect(env.llm.opening(0).CONTEXT.unavailable_sources).toBeUndefined()
    })

    it('reports a server that never connects while the others keep working', async () => {
        fakeMcp.set([{ name: 'down', failures: 99 }, { name: 'up' }])
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.opening(0).CONTEXT.unavailable_sources).toEqual(['down'])
        expect(env.llm.toolNames(0)).toContain('up__ping')
        expect(env.llm.toolNames(0)).not.toContain('down__ping')
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
        env.llm.script({ actions: [act('srv__echo', { text: 'hola' })] }, say('done'))
        await env.send(env.agent(), 'echo')

        expect(fakeMcp.calls).toEqual([{ server: 'srv', tool: 'echo', arguments: { text: 'hola' } }])
    })

    it('turns an error result from the server into a failed observation', async () => {
        fakeMcp.set([{ name: 'srv', tools: [{ name: 'boom', description: 'boom', inputSchema: { type: 'object', properties: {} }, result: () => ({ isError: true, content: [{ type: 'text', text: 'Site not found: x' }] }) }] }])
        env.llm.script({ actions: [act('srv__boom', {})] }, say('done'))
        await env.send(env.agent(), 'boom')

        const [observation] = env.llm.observations(1)
        expect(observation.status).toBe('failed')
        expect(observation.error).toContain('Site not found: x')
        expect(observation.error).toContain('Harness note')
    })

    it('loads the servers again on each run', async () => {
        fakeMcp.set([{ name: 'srv' }])
        const agent = env.agent()
        env.llm.script(say('one'))
        const first = await env.send(agent, 'hola')

        env.llm.script(say('two'))
        await env.send(agent, 'otra vez', first.data._id.toString())

        expect(fakeMcp.connectAttempts.srv).toBe(2)
        expect(env.llm.toolNames(1)).toContain('srv__ping')
    })
})
