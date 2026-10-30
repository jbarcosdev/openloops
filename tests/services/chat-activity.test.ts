import { getChatById } from '@services/chats'
import { deprecatedActivity } from '@services/chats/utils/deprecated-activity'
import { AgentStatus } from '@harness/agent-state'
import { useHarness, warehouseTools, makeTool, act, say } from '../support'

describe('deprecatedActivity', () => {
    const now = Date.UTC(2026, 10, 1, 12, 0, 0)

    it('is a generic word that ends with an ellipsis, so it reads like the activities of before', () => {
        expect(deprecatedActivity('6761ff4826912fad168e6e19', now)).toMatch(/^[A-Z][A-Za-z ]+\.\.\.$/)
    })

    it('stays the same for a chat inside a window of a few seconds, so a client that polls does not see it flicker', () => {
        const first = deprecatedActivity('6761ff4826912fad168e6e19', now)

        expect(deprecatedActivity('6761ff4826912fad168e6e19', now + 1000)).toBe(first)
        expect(deprecatedActivity('6761ff4826912fad168e6e19', now + 2500)).toBe(first)
    })

    it('changes as the run goes on', () => {
        const words = new Set(Array.from({ length: 30 }, (_, index) => deprecatedActivity('6761ff4826912fad168e6e19', now + index * 4000)))

        expect(words.size).toBeGreaterThan(8)
    })

    it('is not the same for every chat at the same time', () => {
        const words = new Set(Array.from({ length: 30 }, (_, index) => deprecatedActivity(`chat-${index}`, now)))

        expect(words.size).toBeGreaterThan(8)
    })

    it('has about twenty different words and never the states that clients treat apart', () => {
        const words = new Set(Array.from({ length: 4000 }, (_, index) => deprecatedActivity(`chat-${index}`, now + index * 4000)))

        expect(words.size).toBe(20)
        expect([...words].some(word => ['stopped...', 'running...', 'stopping...'].includes(word.toLowerCase()))).toBe(false)
    })
})

describe('getChatById and the activity of a chat', () => {
    const env = useHarness()
    let w: ReturnType<typeof warehouseTools>

    beforeEach(() => {
        w = warehouseTools()
    })

    it('adds a generic activity while the run is processing and none when it is over', async () => {
        let during: any
        const probe = makeTool({
            name: 't_probe',
            description: 'reads the chat the way a polling client does',
            handler: async () => {
                const id = env.db.chats.all()[0]._id.toString()
                during = (await getChatById({ id, currentUser: env.user })).data
                return { ok: true }
            },
        })
        env.llm.script(
            { actions: [act('t_probe', {})] },
            say('Listo'),
        )

        await env.send(env.agent([...w.tools, probe]), 'find item 3')

        const id = env.db.chats.all()[0]._id.toString()
        const after = (await getChatById({ id, currentUser: env.user })).data

        expect(during.state.status).toBe(AgentStatus.PROCESSING)
        expect(during.state.currentActivity).toMatch(/\.\.\.$/)
        expect(after?.state?.status).toBe(AgentStatus.IDLE)
        expect(after?.state).not.toHaveProperty('currentActivity')
    })

    it('does not put the generic activity in the chat that the agent saves', async () => {
        const probe = makeTool({
            name: 't_probe',
            description: 'reads the chat the way the agent does',
            handler: async () => {
                const id = env.db.chats.all()[0]._id.toString()
                await getChatById({ id, currentUser: env.user })
                return { ok: true }
            },
        })
        env.llm.script({ actions: [act('t_probe', {})] }, say('Listo'))

        await env.send(env.agent([...w.tools, probe]), 'find item 3')

        expect(env.db.chats.all()[0].state).not.toHaveProperty('currentActivity')
    })
})
