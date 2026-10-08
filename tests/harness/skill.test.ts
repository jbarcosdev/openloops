import { Skill } from '@skills/skill'
import { LLMClient } from '@clients/llm-client'
import { reasoningEngine } from '@loops/agi/skills/reasoning-engine'
import { NATIVE_TOOLS } from '@harness/native-tools'

function respondWith (text: string, extra: Record<string, any> = {}) {
    return jest.spyOn(LLMClient.prototype, 'chat').mockResolvedValue({
        text,
        toolCalls: [],
        stopReason: 'stop',
        responseId: 'resp',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costInUsd: 0.5 },
        ...extra,
    })
}

const base = { sessionId: 's', answerId: 'a' }

describe('Skill.run', () => {
    afterEach(() => jest.restoreAllMocks())

    describe('legacy mode', () => {
        it('sends one user message with instructions, context and input', async () => {
            const chat = respondWith('{"reasoning":"r","x":1}')
            const skill = new Skill({ name: 'legacy', systemInstructions: { rule: 1 } })
            const result = await skill.run({ ...base, userMessage: 'hi', input: { k: 1 }, contextInjection: { c: 2 } })

            const { messages, origin } = chat.mock.calls[0][0]
            const payload = JSON.parse(messages[0].content as string)

            expect(origin).toBe('legacy')
            expect(messages).toHaveLength(1)
            expect(messages[0].role).toBe('user')
            expect(payload.SYSTEM_INSTRUCTIONS.rule).toBe(1)
            expect(payload.CONTEXT).toMatchObject({ c: 2 })
            expect(payload.CONTEXT.now_utc).toBeDefined()
            expect(payload.INPUT).toEqual({ user_message: 'hi', k: 1 })
            expect(result).toMatchObject({ x: 1, responseId: 'resp', costInUsd: 0.5 })
        })
    })

    describe('system role mode', () => {
        const skill = new Skill({ name: 'modern', systemInstructions: { rule: 1 }, systemRole: true, temperature: 0.2 })

        it('puts the instructions in the system message and returns the opening on the first call', async () => {
            const chat = respondWith('{"x":1}')
            const result = await skill.run({ ...base, userMessage: 'hi', contextInjection: { c: 1 } })

            const { messages, temperature } = chat.mock.calls[0][0]
            expect(temperature).toBe(0.2)
            expect(messages).toHaveLength(2)
            expect(messages[0]).toMatchObject({ role: 'system' })
            expect(JSON.parse(messages[0].content as string).rule).toBe(1)
            expect(result.opening).toBe(messages[1].content)
            expect(JSON.parse(result.opening!).INPUT.user_message).toBe('hi')
            expect(JSON.parse(result.opening!).SYSTEM_INSTRUCTIONS).toBeUndefined()
        })

        it('sends the thread as it is when continuing and returns no opening', async () => {
            const chat = respondWith('{"x":1}')
            const history = [{ role: 'user' as const, content: 'before' }, { role: 'assistant' as const, content: 'ok' }]
            const result = await skill.run({ ...base, userMessage: 'ignored', history })

            const { messages } = chat.mock.calls[0][0]
            expect(messages).toHaveLength(3)
            expect(messages[1].content).toBe('before')
            expect(messages[2].role).toBe('assistant')
            expect(result.opening).toBeUndefined()
        })
    })

    it('uses 0.7 when the skill declares no temperature', async () => {
        const chat = respondWith('{"x":1}')
        await new Skill({ name: 's', systemInstructions: {} }).run({ ...base })

        expect(chat.mock.calls[0][0].temperature).toBe(0.7)
    })

    it('passes tools and tool choice to the client', async () => {
        const chat = respondWith('{"x":1}')
        const tools = [{ name: 't', description: 'd', parameters: {} }]
        await new Skill({ name: 's', systemInstructions: {} }).run({ ...base, tools, toolChoice: 'none' })

        expect(chat.mock.calls[0][0]).toMatchObject({ tools, toolChoice: 'none' })
    })

    it('fails when the response has no text', async () => {
        respondWith('')
        await expect(new Skill({ name: 's', systemInstructions: {} }).run({ ...base })).rejects.toThrow('empty or invalid')
    })

    it('leaves a trace with the failure and rethrows', async () => {
        jest.spyOn(LLMClient.prototype, 'chat').mockRejectedValue(new Error('provider down'))
        const addTrace = jest.fn()

        await expect(new Skill({ name: 's', systemInstructions: {} }).run({ ...base, chat: { addTrace } as any })).rejects.toThrow('provider down')
        expect(addTrace).toHaveBeenCalledWith({ node: 's', reasoning: 'Failed: provider down' })
    })
})

describe('reasoning engine contract', () => {
    const instructions = JSON.stringify(reasoningEngine.systemInstructions)

    it('is a system role skill at low temperature', () => {
        expect(reasoningEngine.name).toBe('reasoning_engine')
        expect(reasoningEngine.systemRole).toBe(true)
        expect(reasoningEngine.temperature).toBe(0.3)
    })

    it('mentions every native tool by name', () => {
        for (const tool of NATIVE_TOOLS) expect(instructions).toContain(tool.name)
    })

    it.each(['OUTPUT_FORMAT', 'STATE', 'LEARNED', 'ACTIONS', 'REFERENCES', 'WORKSPACE', 'CONFIRMATION', 'ARGUMENT_SOURCES', 'IDENTIFIERS'])('keeps the %s rule', rule => {
        expect(instructions).toContain(`${rule}:`)
    })

    it('teaches the find option of read_context', () => {
        expect(instructions).toMatch(/\\"find\\"|find/)
    })
})
