import { Agent } from '@harness/index'
import { AgentStatus } from '@harness/agent-state'
import { Chat } from '@services/chats/entities/chat.entity'
import { Guard, inputGuards } from '@guardrails/index'
import { useHarness, warehouseTools, say, makeLoop } from '../support'

const env = useHarness()
const llm = env.llm
const w = warehouseTools()

const { blockCode } = inputGuards

const fenced = 'revisa esto:\n```js\nconsole.log(1)\n```'

function guard (name: string, decide: (message: string) => boolean | Error, calls: string[] = []) {
    return new Guard({
        name,
        type: 'input',
        reply: `blocked by ${name}`,
        handler: ({ message }) => {
            calls.push(name)
            const outcome = decide(message)
            if (outcome instanceof Error) throw outcome
            return outcome ? { passed: false, reason: `${name} said no` } : { passed: true }
        },
    })
}

describe('a blocked message', () => {
    let chat: any
    let blocker: Guard

    beforeEach(async () => {
        blocker = blockCode
        llm.script(say('unused'))
        const result = await env.send(env.agent(w.tools, [blocker]), fenced)
        chat = result.data
    })

    it('never reaches the model and creates no task', () => {
        expect(llm.calls).toHaveLength(0)
        expect(env.tasks()).toHaveLength(0)
    })

    it('answers with the guard reply and its reference', () => {
        const [user, assistant] = chat.messages

        expect(assistant.role).toBe('assistant')
        expect(assistant.content).toBe(`Code is not accepted in this conversation.\n\nRef: ${blocker.ref}`)
        expect(user.excludeFromContext).toBe(true)
        expect(assistant.excludeFromContext).toBe(true)
    })

    it('stores the exchange flagged as excluded from the context and leaves the chat idle', () => {
        const stored = env.db.chats.findById(chat._id.toString())!

        expect(stored.messages.map((m: any) => m.excludeFromContext)).toEqual([true, true])
        expect(stored.state.status).toBe(AgentStatus.IDLE)
    })

    it('records why it was blocked in the traces, never in the message', () => {
        const trace = env.traces().find(entry => entry.kind === 'guard')!

        expect(trace.node).toBe('block_code')
        expect(trace.reasoning).toContain(`input guard, Ref ${blocker.ref}`)
        expect(trace.reasoning).toContain('Fenced code block')
        expect(chat.messages[1].content).not.toContain('Fenced code block')
    })
})

describe('the conversation after a block', () => {
    it('does not show the blocked exchange to the model', async () => {
        const agent = env.agent(w.tools, [blockCode])
        const blocked = await env.send(agent, fenced)

        llm.script(say('hello'))
        await env.send(agent, 'hola', blocked.data._id.toString())

        expect(llm.calls).toHaveLength(1)
        expect(llm.opening(0).CONTEXT.chat_history).toBeUndefined()
        expect(JSON.stringify(llm.call(0).messages)).not.toContain('console.log')
    })

    it('keeps normal turns in the history and skips only the blocked ones', async () => {
        const agent = env.agent(w.tools, [blockCode])

        llm.script(say('first answer'))
        const first = await env.send(agent, 'one')
        const chatId = first.data._id.toString()
        await env.send(agent, fenced, chatId)

        llm.script(say('second answer'))
        await env.send(agent, 'three', chatId)

        const history = llm.opening(1).CONTEXT.chat_history.map((m: any) => m.content)
        expect(history).toEqual(['one', 'first answer'])
    })

    it('ignores the blocked reply when looking for the last answer', () => {
        const chat = Chat.fromJSON({
            messages: [
                { role: 'user', content: 'a' },
                { role: 'assistant', content: 'real answer' },
                { role: 'user', content: 'b', excludeFromContext: true },
                { role: 'assistant', content: 'blocked\n\nRef: r', excludeFromContext: true },
            ],
        })

        expect(chat.lastAnswer).toBe('real answer')
    })
})

describe('guard order and failures', () => {
    it('stops at the first guard that blocks', async () => {
        const calls: string[] = []
        const guards = [guard('one', () => false, calls), guard('two', () => true, calls), guard('three', () => true, calls)]

        const result = await env.send(env.agent(w.tools, guards), 'hola')

        expect(calls).toEqual(['one', 'two'])
        expect(result.data.messages[1].content).toContain('blocked by two')
        expect(result.data.messages[1].content).toContain(`Ref: ${guards[1].ref}`)
    })

    it('lets the message through when every guard passes', async () => {
        llm.script(say('done'))
        const result = await env.send(env.agent(w.tools, [guard('one', () => false), guard('two', () => false)]), 'hola')

        expect(llm.calls).toHaveLength(1)
        expect(result.data.messages.at(-1).content).toBe('done')
        expect(result.data.messages.every((m: any) => !m.excludeFromContext)).toBe(true)
    })

    it('closes the request when a guard throws', async () => {
        const broken = guard('broken', () => new Error('classifier down'))
        const result = await env.send(env.agent(w.tools, [broken]), 'hola')

        expect(llm.calls).toHaveLength(0)
        expect(result.error).toBeUndefined()
        expect(result.data.messages[1].content).toBe(`The request could not be processed.\n\nRef: ${broken.ref}`)
        expect(env.traces().find(entry => entry.kind === 'guard')!.reasoning).toContain('classifier down')
    })

    it('treats guards from the constructor and from addGuard the same way', async () => {
        const viaOptions = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async () => undefined } }), guards: [guard('opt', () => true)] })
        const viaMethod = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async () => undefined } }) })
        viaMethod.addGuard(guard('opt', () => true))

        const one = await env.send(viaOptions, 'hola')
        const two = await env.send(viaMethod, 'hola')

        expect(one.data.messages[1].content).toBe(two.data.messages[1].content)
    })

    it('runs guards before the pre execution hooks and skips the hooks when blocked', async () => {
        let hooks = 0
        const loop = makeLoop({ initialNode: 'a', nodes: { a: async ctx => { ctx.chat.state.setStatus(AgentStatus.IDLE) } } })
        const agent = new Agent({ loop, guards: [guard('no', message => message === 'blocked')] })
        agent.addHook('pre_execution', () => { hooks++ })

        await env.send(agent, 'blocked')
        expect(hooks).toBe(0)

        await env.send(agent, 'allowed')
        expect(hooks).toBe(1)
    })
})

describe('the input size limit', () => {
    it('blocks messages above 100000 characters by default without calling the model', async () => {
        const result = await env.send(env.agent(w.tools), 'a'.repeat(100_001))

        expect(llm.calls).toHaveLength(0)
        expect(result.data.messages[1].content).toMatch(/^The message is too long\.\n\nRef: /)
        expect(result.data.messages.every((m: any) => m.excludeFromContext)).toBe(true)
        expect(env.traces().find(entry => entry.kind === 'guard')!.reasoning).toContain('100001 of 100000 characters')
    })

    it('lets a message of exactly the limit through', async () => {
        llm.script(say('ok'))
        const result = await env.send(env.agent(w.tools), 'a'.repeat(100_000))

        expect(llm.calls).toHaveLength(1)
        expect(result.data.messages.at(-1).content).toBe('ok')
    })

    it('uses the maxInputLength option', async () => {
        const agent = new Agent({ loop: makeLoop({ initialNode: 'a', nodes: { a: async () => undefined } }), maxInputLength: 10 })

        const result = await env.send(agent, 'x'.repeat(11))

        expect(result.data.messages[1].content).toContain('The message is too long.')
    })

    it('runs before the guards added by the user', async () => {
        const calls: string[] = []
        await env.send(env.agent(w.tools, [guard('mine', () => false, calls)]), 'a'.repeat(100_001))

        expect(calls).toEqual([])
    })
})
