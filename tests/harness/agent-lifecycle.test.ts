import { Agent, AgentStatus, AGENT_ERROR_CODES } from '@harness/index'
import { AgentTask } from '@services/tasks/entities/agent-task.entity'
import { useHarness, makeLoop } from '../support'

describe('Agent lifecycle', () => {
    const env = useHarness()

    it('requires a loop', () => {
        expect(() => new Agent({} as any)).toThrow('AgentLoop instance is required')
    })

    it('requires a message and a user', async () => {
        const agent = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async () => {} } }) })

        expect((await agent.run({ input: { message: '' }, currentUser: env.user })).error).toContain('Message is required')
        expect((await agent.run({ input: { message: 'x' }, currentUser: undefined as any })).error).toContain('CurrentUser is required')
    })

    it('creates a chat, stores both messages and goes idle after a reply', async () => {
        const loop = makeLoop({
            initialNode: 'greet',
            nodes: {
                greet: async ctx => {
                    ctx.chat.state.setStatus(AgentStatus.IDLE)
                    ctx.reply('hola')
                },
            },
        })
        const result = await env.send(new Agent({ loop }), 'hi')

        expect(result.error).toBeUndefined()
        expect(result.data.state.status).toBe(AgentStatus.IDLE)
        expect(env.db.chats.all()).toHaveLength(1)
        expect(env.db.chats.all()[0].messages.map((m: any) => `${m.role}:${m.content}`)).toEqual(['user:hi', 'assistant:hola'])
    })

    it('runs the pre and post hooks around the loop', async () => {
        const order: string[] = []
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { order.push('node'); ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        const agent = new Agent({ loop })
        agent.addHook('pre_execution', async () => { order.push('pre') })
        agent.addHook('post_execution', async () => { order.push('post') })
        await env.send(agent, 'x')

        expect(order).toEqual(['pre', 'node', 'post'])
    })

    it('follows the next node a node asks for', async () => {
        const order: string[] = []
        const loop = makeLoop({
            initialNode: 'first',
            nodes: {
                first: async ctx => { order.push('first'); ctx.setNextNode('second') },
                second: async ctx => { order.push('second'); ctx.chat.state.setStatus(AgentStatus.IDLE) },
            },
        })
        await env.send(new Agent({ loop }), 'x')

        expect(order).toEqual(['first', 'second'])
    })

    it('fails with a clear code when the loop never ends', async () => {
        const loop = makeLoop({ initialNode: 'spin', nodes: { spin: async () => {} } })
        const result = await env.send(new Agent({ loop, maxIterations: 3 }), 'x')

        expect(result.data.state.status).toBe(AgentStatus.FAILED)
        expect(result.data.state.lastError.code).toBe(AGENT_ERROR_CODES.MAX_ITERATIONS_REACHED)
    })

    it('fails when the loop points to a node that does not exist', async () => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.setNextNode('ghost') } } })
        const result = await env.send(new Agent({ loop }), 'x')

        expect(result.data.state.status).toBe(AgentStatus.FAILED)
        expect(result.data.state.lastError.code).toBe(AGENT_ERROR_CODES.NODE_NOT_FOUND)
    })

    it('reports an error thrown by a node and persists the failed state', async () => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async () => { throw new Error('node exploded') } } })
        const result = await env.send(new Agent({ loop }), 'x')

        expect(result.error).toBe('node exploded')
        expect(result.data.state.status).toBe(AgentStatus.FAILED)
        expect(result.data.state.lastError).toMatchObject({ code: AGENT_ERROR_CODES.RUN_FAILED, message: 'node exploded' })
        expect(env.db.chats.all()[0].state.status).toBe(AgentStatus.FAILED)
    })

    it('stops before running a node when an interruption was already requested', async () => {
        let ran = 0
        const agent = new Agent({ loop: makeLoop({ initialNode: 'work', nodes: { work: async () => { ran++ } } }), maxIterations: 10 })
        agent.addHook('pre_execution', async () => {
            await Agent.interruptExecution(env.db.chats.all()[0]._id.toString(), env.user)
        })
        const result = await env.send(agent, 'x')

        expect(ran).toBe(0)
        expect(result.data.state.status).toBe(AgentStatus.IDLE)
        expect(result.data.state.stopRequested).toBeFalsy()
    })

    it('flags the chat state when an interruption is requested', async () => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        const first = await env.send(new Agent({ loop }), 'x')
        await Agent.interruptExecution(first.data._id.toString(), env.user)

        expect(env.db.chats.all()[0].state.stopRequested).toBe(true)
    })

    it('stops when the agent is asked to', async () => {
        const agent: Agent = new Agent({
            loop: makeLoop({ initialNode: 'a', nodes: { a: async () => { agent.stopAgent() } } }),
            maxIterations: 10,
        })
        const result = await env.send(agent, 'x')

        expect(result.error).toBeUndefined()
        expect(result.data.state.status).toBe(AgentStatus.IDLE)
    })

    it('continues an existing chat and keeps its messages', async () => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.chat.state.setStatus(AgentStatus.IDLE); ctx.reply('ok') } } })
        const agent = new Agent({ loop })
        const first = await env.send(agent, 'one')
        await env.send(agent, 'two', first.data._id.toString())

        expect(env.db.chats.all()).toHaveLength(1)
        expect(env.db.chats.all()[0].messages.map((m: any) => m.content)).toEqual(['one', 'ok', 'two', 'ok'])
    })

    it('adds tools after construction', () => {
        const agent = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async () => {} } }) })
        agent.addTool({ name: 'x' } as any)

        expect(agent.tools.map(t => t.name)).toEqual(['x'])
    })
})

describe('Agent with a finished active task', () => {
    const env = useHarness()

    it.each(['completed', 'failed', 'cancelled', 'abandoned'])('does not resume a %s task when the chat continues', async status => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        const first = await env.send(new Agent({ loop }), 'one')
        const chatId = first.data._id.toString()

        const task = AgentTask.factory({ chatId, goal: 'old', status: status as any })
        env.db.tasks.insert(task.toDocument())
        env.db.chats.patch(chatId, { state: { activeTaskId: task.id } }, [], { merge: true })

        let seen: unknown = 'unset'
        const probe = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { seen = ctx.task?.id; ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        await env.send(new Agent({ loop: probe }), 'two', chatId)

        expect(seen).toBeUndefined()
    })

    it('still resumes a task that is waiting for the user', async () => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        const first = await env.send(new Agent({ loop }), 'one')
        const chatId = first.data._id.toString()

        const task = AgentTask.factory({ chatId, goal: 'open', status: 'awaiting_user' as any })
        env.db.tasks.insert(task.toDocument())
        env.db.chats.patch(chatId, { state: { activeTaskId: task.id } }, [], { merge: true })

        let seen: unknown
        const probe = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { seen = ctx.task?.id; ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        await env.send(new Agent({ loop: probe }), 'two', chatId)

        expect(seen).toBe(task.id)
    })

    it.each(['completeTask', 'failTask', 'cancelTask'])('removes activeTaskId from the stored chat after %s', async method => {
        const open = makeLoop({ initialNode: 'a', nodes: { a: async ctx => {
            ctx.chat.createTask('goal')
            ctx.chat.state.setStatus(AgentStatus.IDLE)
        } } })
        const first = await env.send(new Agent({ loop: open }), 'one')
        const chatId = first.data._id.toString()

        expect(env.db.chats.findById(chatId)?.state.activeTaskId).toBeDefined()

        const close = makeLoop({ initialNode: 'a', nodes: { a: async ctx => {
            ctx.chat[method]()
            ctx.chat.state.setStatus(AgentStatus.IDLE)
        } } })
        await env.send(new Agent({ loop: close }), 'two', chatId)

        expect('activeTaskId' in env.db.chats.findById(chatId)!.state).toBe(false)
    })

    it('keeps the new activeTaskId when a task is created after another one finished in the same run', async () => {
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => {
            ctx.chat.createTask('first')
            ctx.chat.completeTask()
            const next = ctx.chat.createTask('second')
            ctx.chat.state.setStatus(AgentStatus.IDLE)
            ctx.chat.state.setActiveTaskId(next.id)
        } } })
        const first = await env.send(new Agent({ loop }), 'one')
        const stored = env.db.chats.findById(first.data._id.toString())

        expect(stored?.state.activeTaskId).toBeDefined()
    })
})
