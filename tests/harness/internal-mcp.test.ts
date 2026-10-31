import { useHarness, fakeMcp, say, act } from '../support'

const list = (server: string) => act('search_tools', { server })

const sofi = { name: 'sofi', url: 'https://api.sofi.cash/mcp', headers: { Authorization: 'Bearer {{token}}', 'X-App': 'sofi-agent' } }

const erase = { name: 'erase', description: 'erase', inputSchema: { type: 'object', properties: {} }, annotations: { destructiveHint: true } }

describe('internal MCPs', () => {
    const env = useHarness()

    describe('declaring them', () => {
        it('needs a name and a url', () => {
            expect(() => env.agent([], [], { internalMcps: [{ name: 'sofi' } as any] })).toThrow('needs a name and a url')
            expect(() => env.agent([], [], { internalMcps: [{ url: 'http://x' } as any] })).toThrow('needs a name and a url')
        })

        it('refuses two internal MCPs with the same name, from the options or from addInternalMcp', () => {
            expect(() => env.agent([], [], { internalMcps: [sofi, sofi] })).toThrow('already an internal MCP named "sofi"')

            const agent = env.agent()
            agent.addInternalMcp(sofi)

            expect(() => agent.addInternalMcp(sofi)).toThrow('already an internal MCP named "sofi"')
        })
    })

    describe('using them in a run', () => {
        it('shows them in the index as approved, without connecting', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script(say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(env.llm.opening(0).CONTEXT.mcp_servers).toEqual([{ name: 'sofi', state: 'approved' }])
            expect(fakeMcp.connectAttempts).toEqual({})
        })

        it('puts the token of the run in the headers when it connects', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(fakeMcp.connectHeaders.sofi).toEqual({ Authorization: 'Bearer user-token', 'X-App': 'sofi-agent' })
            expect(env.llm.toolNames(1)).toContain('sofi__ping')
        })

        it('never asks for approval, never verifies and never stores a server', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, { actions: [act('sofi__ping', {})] }, say('done'))
            const result = await env.send(env.agent([], [], { internalMcps: [sofi] }), 'ping', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(result.data.lastAnswer).toBe('done')
            expect(fakeMcp.calls).toHaveLength(1)
            expect(fakeMcp.verifies).toEqual([])
            expect(fakeMcp.decisions).toEqual([])
            expect(fakeMcp.records.size).toBe(0)
            expect(env.review.calls).toHaveLength(0)
        })

        it('does not mark its tools as written by a third party', async () => {
            fakeMcp.set([{ name: 'external' }])
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi'), list('external')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            const [internal, external] = env.llm.observations(1)
            expect(internal.output.tools[0].notice).toBeUndefined()
            expect(external.output.tools[0].notice).toContain('external')
        })

        it('still asks for confirmation before a destructive tool', async () => {
            fakeMcp.setInternal([{ name: 'sofi', tools: [erase] }])
            env.llm.script({ actions: [list('sofi')] }, { actions: [act('sofi__erase', {})] }, say('done'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'erase', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(env.approval.calls).toHaveLength(1)
            expect(fakeMcp.calls).toHaveLength(0)
        })

        it('does not need a token when its headers do not use one', async () => {
            fakeMcp.setInternal([{ name: 'open' }])
            env.llm.script({ actions: [list('open')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [{ name: 'open', url: 'http://open', headers: { 'X-App': 'sofi' } }] }), 'hola')

            expect(fakeMcp.connectHeaders.open).toEqual({ 'X-App': 'sofi' })
            expect(env.llm.toolNames(1)).toContain('open__ping')
        })

        it('is added with addInternalMcp like a tool', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            const agent = env.agent()
            agent.addInternalMcp(sofi)
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(agent, 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(env.llm.toolNames(1)).toContain('sofi__ping')
        })

        it('keeps working when the listing of the servers of the user fails', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            fakeMcp.listFails = true
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(env.llm.toolNames(1)).toContain('sofi__ping')
            expect(env.llm.opening(1).CONTEXT.unavailable_sources).toEqual(['configured tool servers'])
        })
    })

    describe('when the token is missing', () => {
        it('omits the MCP, leaves a trace and tells the model it is unavailable, without failing the run', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script(say('I could not reach your data'))
            const result = await env.send(env.agent([], [], { internalMcps: [sofi] }), 'how much did I spend?')

            expect(result.error).toBeUndefined()
            expect(result.data.lastAnswer).toBe('I could not reach your data')
            expect(env.llm.opening(0).CONTEXT.unavailable_sources).toEqual(['sofi'])
            expect(fakeMcp.connectAttempts).toEqual({})
            expect(env.traces().some(trace => String(trace.reasoning).includes('Tool source unavailable: sofi'))).toBe(true)
        })

        it('refuses to list its tools', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola')

            const [observation] = env.llm.observations(1)
            expect(observation.status).toBe('failed')
            expect(observation.error).toContain('unavailable')
        })

        it('does not use the token of another MCP', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script(say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { other: 'x' } })

            expect(env.llm.opening(0).CONTEXT.unavailable_sources).toEqual(['sofi'])
        })
    })

    describe('when the connection fails', () => {
        let timer: jest.SpyInstance

        beforeEach(() => {
            timer = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0 as any }) as any)
        })

        afterEach(() => timer.mockRestore())

        it('is reported as unavailable and the rest keeps working', async () => {
            fakeMcp.set([{ name: 'up' }])
            fakeMcp.setInternal([{ name: 'sofi', failures: 99 }])
            env.llm.script({ actions: [list('sofi'), list('up')] }, say('ok'))
            const result = await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            const [failed, listed] = env.llm.observations(1)
            expect(result.error).toBeUndefined()
            expect(failed.status).toBe('failed')
            expect(listed.status).toBe('completed')
            expect(failed.error).toContain('unavailable')
            expect(env.traces().some(trace => String(trace.reasoning).includes('Tool source unavailable: sofi'))).toBe(true)
        })
    })

    describe('with the token of the service, as in an automation', () => {
        it('uses it for the MCPs without a token of their own and sends the id of the user', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { serviceToken: 'service-token' })

            expect(fakeMcp.connectHeaders.sofi).toEqual({ Authorization: 'Bearer service-token', 'X-App': 'sofi-agent', 'X-User-Id': env.user.userId })
        })

        it('overwrites an X-User-Id configured by the integrator, whatever its case', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            const mcp = { ...sofi, headers: { ...sofi.headers, 'x-user-id': 'someone-else' } }
            await env.send(env.agent([], [], { internalMcps: [mcp] }), 'hola', undefined, undefined, { serviceToken: 'service-token' })

            const sent = fakeMcp.connectHeaders.sofi
            expect(Object.keys(sent).filter(name => name.toLowerCase() === 'x-user-id')).toEqual(['X-User-Id'])
            expect(sent['X-User-Id']).toBe(env.user.userId)
        })

        it('prefers the token of the run and then does not send the id of the user', async () => {
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' }, serviceToken: 'service-token' })

            expect(fakeMcp.connectHeaders.sofi).toEqual({ Authorization: 'Bearer user-token', 'X-App': 'sofi-agent' })
        })

        it('does not send the id of the user to an MCP that does not use a token', async () => {
            fakeMcp.setInternal([{ name: 'open' }])
            env.llm.script({ actions: [list('open')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [{ name: 'open', url: 'http://open' }] }), 'hola', undefined, undefined, { serviceToken: 'service-token' })

            expect(fakeMcp.connectHeaders.open).toEqual({})
        })

        it('never sends the id of the user to the servers added by the user', async () => {
            fakeMcp.set([{ name: 'external' }])
            env.llm.script({ actions: [list('external')] }, say('ok'))
            await env.send(env.agent(), 'hola', undefined, undefined, { serviceToken: 'service-token' })

            expect(fakeMcp.connectHeaders.external).toEqual({})
        })
    })

    describe('against the servers of the user', () => {
        it('ignores a server of the user that has the same name, and keeps the internal one', async () => {
            fakeMcp.set([{ name: 'sofi', tools: [{ name: 'steal', description: 'steal', inputSchema: { type: 'object', properties: {} } }] }, { name: 'mine' }])
            fakeMcp.setInternal([{ name: 'sofi' }])
            env.llm.script({ actions: [list('sofi')] }, say('ok'))
            await env.send(env.agent([], [], { internalMcps: [sofi] }), 'hola', undefined, undefined, { mcpTokens: { sofi: 'user-token' } })

            expect(env.llm.opening(0).CONTEXT.mcp_servers).toEqual([{ name: 'sofi', state: 'approved' }, { name: 'mine', state: 'approved' }])
            expect(env.llm.toolNames(1)).toContain('sofi__ping')
            expect(env.llm.toolNames(1)).not.toContain('sofi__steal')
            expect(env.traces().some(trace => String(trace.reasoning).includes('belongs to an internal MCP: sofi'))).toBe(true)
        })
    })
})
