import { useHarness, fakeMcp, say, act } from '../support'

const list = (server: string) => act('search_tools', { server })

describe('internal MCPs stored in the database', () => {
    const env = useHarness()

    it('are shown as approved and connect with the token of the run in the template', async () => {
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://fake/crm', headers: { Authorization: 'Bearer {{token}}' } }]
        env.llm.script({ actions: [list('crm')] }, say('ok'))
        await env.send(env.agent(), 'hola', undefined, undefined, { mcpTokens: { crm: 'user-token' } })

        expect(env.llm.opening(0).CONTEXT.mcp_servers).toEqual([{ name: 'crm', state: 'approved' }])
        expect(fakeMcp.connectHeaders.crm).toEqual({ Authorization: 'Bearer user-token' })
        expect(env.llm.toolNames(1)).toContain('crm__ping')
    })

    it('send a literal token as it is and need none in the run', async () => {
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://fake/crm', headers: { Authorization: 'Bearer eyj.fixed' } }]
        env.llm.script({ actions: [list('crm')] }, say('ok'))
        await env.send(env.agent(), 'hola')

        expect(fakeMcp.connectHeaders.crm).toEqual({ Authorization: 'Bearer eyj.fixed' })
    })

    it('are unavailable without a token when the template needs one, and the run continues', async () => {
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://fake/crm', headers: { Authorization: 'Bearer {{token}}' } }]
        env.llm.script(say('ok'))
        const result = await env.send(env.agent(), 'hola')

        expect(result.error).toBeUndefined()
        expect(env.llm.opening(0).CONTEXT.unavailable_sources).toEqual(['crm'])
    })

    it('use their autonomous token only in an autonomous run', async () => {
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://fake/crm', headers: { Authorization: 'Bearer {{token}}' }, autonomousToken: 'service-token' }]
        env.llm.script({ actions: [list('crm')] }, say('ok'))
        await env.send(env.agent(), 'hola', undefined, { executionMode: 'autonomous' })

        expect(fakeMcp.connectHeaders.crm).toEqual({ Authorization: 'Bearer service-token', 'X-User-Id': env.user.userId })
    })

    it('never verify, never store and never ask for approval', async () => {
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://fake/crm' }]
        env.llm.script({ actions: [list('crm')] }, { actions: [act('crm__ping', {})] }, say('done'))
        const result = await env.send(env.agent(), 'ping')

        expect(result.data.lastAnswer).toBe('done')
        expect(fakeMcp.verifies).toEqual([])
        expect(fakeMcp.decisions).toEqual([])
        expect(env.review.calls).toHaveLength(0)
    })

    it('lose to an internal MCP of the constructor with the same name', async () => {
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://stored', headers: { 'X-From': 'stored' } }]
        env.llm.script({ actions: [list('crm')] }, say('ok'))
        await env.send(env.agent([], [], { internalMcps: [{ name: 'crm', url: 'http://code', headers: { 'X-From': 'code' } }] }), 'hola')

        expect(fakeMcp.connectHeaders.crm).toEqual({ 'X-From': 'code' })
    })

    it('reserve their name against the servers of the user', async () => {
        fakeMcp.set([{ name: 'crm' }])
        fakeMcp.setInternal([{ name: 'crm' }])
        fakeMcp.stored = [{ name: 'crm', url: 'http://fake/crm' }]
        env.llm.script(say('ok'))
        await env.send(env.agent(), 'hola')

        expect(env.llm.opening(0).CONTEXT.mcp_servers).toEqual([{ name: 'crm', state: 'approved' }])
    })

    it('keep the run alive when they cannot be listed', async () => {
        fakeMcp.set([{ name: 'mine' }])
        fakeMcp.storedFails = true
        env.llm.script({ actions: [list('mine')] }, say('ok'))
        const result = await env.send(env.agent(), 'hola')

        expect(result.error).toBeUndefined()
        expect(env.llm.opening(1).CONTEXT.unavailable_sources).toEqual(['configured tool servers'])
    })
})
