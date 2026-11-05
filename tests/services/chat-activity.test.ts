import { getChatById } from '@services/chats'
import { AgentStatus } from '@harness/agent-state'
import { useHarness, warehouseTools, makeTool, act, say } from '../support'

describe('getChatById and the activity of a chat', () => {
    const env = useHarness()
    let w: ReturnType<typeof warehouseTools>

    beforeEach(() => {
        w = warehouseTools()
    })

    it('adds no activity to the chat while the run is processing', async () => {
        let during: any
        const probe = makeTool({
            name: 't_probe',
            description: 'reads the chat the way a polling client does',
            handler: async () => {
                const id = env.db.chats.all()[0]._id.toString()
                during = await getChatById({ id, currentUser: env.user })
                return { ok: true }
            },
        })
        env.llm.script(
            { actions: [act('t_probe', {})] },
            say('Listo'),
        )

        await env.send(env.agent([...w.tools, probe]), 'find item 3')

        expect(during.state.status).toBe(AgentStatus.PROCESSING)
        expect(during.state).not.toHaveProperty('currentActivity')
        expect(env.db.chats.all()[0].state).not.toHaveProperty('currentActivity')
    })
})
