import { AgentStatus } from '@harness/agent-state'
import { Agent } from '@harness/index'
import { useHarness, warehouseTools, makeTool, act, say } from '../support'

describe('Agent chat writes', () => {
    const env = useHarness()
    const llm = env.llm
    let w: ReturnType<typeof warehouseTools>

    beforeEach(() => {
        w = warehouseTools()
    })

    const script = () => llm.script(
        { activity: 'Buscando', actions: [act('t_search', { q: 'warehouse' })] },
        { activity: 'Sumando', actions: [act('t_get', { id: '{{step_1_1.output.results[3].id}}' })] },
        { activity: 'Revisando', actions: [act('t_get', { id: '{{step_1_1.output.results[2].id}}' })] },
        say('Listo'),
    )

    const writesOf = async (listen: boolean) => {
        script()
        const agent = env.agent(w.tools)
        if (listen) agent.onActivity(() => undefined)

        const before = env.db.chats.writes
        const result = await env.send(agent, 'find item 3')

        return { writes: env.db.chats.writes - before, result }
    }

    it('writes the chat after every node when nobody listens, so the clients that poll see the activity', async () => {
        const { writes } = await writesOf(false)

        expect(writes).toBeGreaterThanOrEqual(8)
    })

    it('does not write the chat for an activity that a listener already received', async () => {
        const polled = await writesOf(false)
        const listened = await writesOf(true)

        expect(listened.writes).toBeLessThanOrEqual(5)
        expect(listened.writes).toBeLessThanOrEqual(polled.writes - 3)
    })

    it('leaves the chat complete in the database when the run ends, with the activity of the end', async () => {
        const { result } = await writesOf(true)

        const [chat] = env.db.chats.all()
        expect(result.error).toBeUndefined()
        expect(chat.state.status).toBe(AgentStatus.IDLE)
        expect(chat.state.currentActivity).toBe('stopped')
        expect(chat.messages.map((message: any) => `${message.role}:${message.content}`)).toEqual(['user:find item 3', 'assistant:Listo'])
    })

    it('has the user message and the processing state in the database while the run goes on', async () => {
        let during: any
        const probe = makeTool({
            name: 't_probe',
            description: 'reads the chat while the run goes on',
            handler: async () => {
                during = env.db.chats.all()[0]
                return { ok: true }
            },
        })
        llm.script(
            { activity: 'Revisando', actions: [act('t_search', { q: 'warehouse' })] },
            { activity: 'Mirando', actions: [act('t_probe', {})] },
            say('Listo'),
        )
        const agent = env.agent([...w.tools, probe])
        agent.onActivity(() => undefined)

        await env.send(agent, 'find item 3')

        expect(during.state.status).toBe(AgentStatus.PROCESSING)
        expect(during.messages.map((message: any) => message.content)).toEqual(['find item 3'])
        expect(during.state.activeTaskId).toBeDefined()
    })

    it('writes the chat when something other than the activity changes, even with a listener', async () => {
        const agent = env.agent(w.tools)
        agent.onActivity(() => undefined)
        llm.script(say('uno'))
        const first = await env.send(agent, 'a')
        const chatId = first.data._id.toString()
        const before = env.db.chats.writes

        llm.script(say('dos'))
        const second = env.agent(w.tools)
        second.onActivity(() => undefined)
        await env.send(second, 'b', chatId)

        const [chat] = env.db.chats.all()
        expect(env.db.chats.writes).toBeGreaterThan(before)
        expect(chat.messages.map((message: any) => message.content)).toEqual(['a', 'uno', 'b', 'dos'])
    })

    it('still stops a run that was interrupted from another request', async () => {
        const stopper = makeTool({
            name: 't_stop',
            description: 'asks to stop the run from outside',
            handler: async () => {
                await Agent.interruptExecution(env.db.chats.all()[0]._id.toString(), env.user)
                return { ok: true }
            },
        })
        llm.script(
            { activity: 'Uno', actions: [act('t_stop', {})] },
            { activity: 'Dos', actions: [act('t_search', { q: 'warehouse' })] },
            say('No debería llegar'),
        )
        const agent = env.agent([...w.tools, stopper])
        agent.onActivity(() => undefined)

        await env.send(agent, 'find item 3')

        const [chat] = env.db.chats.all()
        expect(chat.state.status).toBe(AgentStatus.IDLE)
        expect(llm.calls.length).toBeLessThan(3)

        llm.script(say('Ya puedo seguir'))
        const next = env.agent(w.tools)
        next.onActivity(() => undefined)
        const result = await env.send(next, 'otra vez', chat._id.toString())

        expect(result.error).toBeUndefined()
        expect(result.data.state.status).toBe(AgentStatus.IDLE)
        expect(env.db.chats.all()[0].messages.at(-1).content).toBe('Ya puedo seguir')
    })
})
