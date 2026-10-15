import { Skill } from '@skills/skill'
import { LLMClient } from '@clients/llm/llm-client'
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

    describe('without the system role', () => {
        it('sends one user message with instructions, context and input', async () => {
            const chat = respondWith('{"reasoning":"r","x":1}')
            const skill = new Skill({ name: 'legacy', systemInstructions: { rule: 1 }, systemRole: false })
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
        const skill = new Skill({ name: 'modern', systemInstructions: { rule: 1 }, temperature: 0.2 })

        it('is the default', () => {
            expect(skill.systemRole).toBe(true)
        })

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

    describe('chat turns', () => {
        const turns = [{ role: 'user' as const, content: 'hi' }, { role: 'assistant' as const, content: 'hello there' }]
        const skill = new Skill({ name: 'chatty', systemInstructions: { rule: 1 } })

        it('are placed before the opening as real messages', async () => {
            const chat = respondWith('{"x":1}')
            await skill.run({ ...base, userMessage: 'and now?', chatHistory: turns })

            const { messages } = chat.mock.calls[0][0]
            expect(messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
            expect(messages[1].content).toBe('hi')
            expect(messages[2].content).toBe('hello there')
            expect(JSON.parse(messages[3].content as string).INPUT.user_message).toBe('and now?')
        })

        it('keep the prefix identical when the chat grows by one exchange', async () => {
            const chat = respondWith('{"x":1}')
            await skill.run({ ...base, userMessage: 'one', chatHistory: turns })
            await skill.run({ ...base, userMessage: 'two', chatHistory: [...turns, { role: 'user', content: 'one' }, { role: 'assistant', content: 'answer' }] })

            const first = chat.mock.calls[0][0].messages.slice(0, -1)
            expect(chat.mock.calls[1][0].messages.slice(0, first.length)).toEqual(first)
        })

        it('cannot be combined with a thread to continue', async () => {
            const chat = respondWith('{"x":1}')

            await expect(skill.run({ ...base, history: [{ role: 'user', content: 'x' }], chatHistory: turns })).rejects.toThrow('history and chatHistory cannot be used together')
            expect(chat).not.toHaveBeenCalled()
        })
    })

    describe('the context injection', () => {
        const skill = new Skill({ name: 'strict', systemInstructions: {} })

        it.each(['tools', 'mode', 'history', 'chatHistory'])('rejects %s because it has its own run option', async (key) => {
            const chat = respondWith('{"x":1}')

            await expect(skill.run({ ...base, contextInjection: { [key]: [] } })).rejects.toThrow(`[SKILL:strict] ${key} must be passed as run options`)
            expect(chat).not.toHaveBeenCalled()
        })

        it('names every misplaced key', async () => {
            await expect(skill.run({ ...base, contextInjection: { tools: [], history: [] } })).rejects.toThrow('tools, history must be passed')
        })

        it('accepts any other key', async () => {
            respondWith('{"x":1}')

            await expect(skill.run({ ...base, contextInjection: { chat_history: [], last_completed_task: {} } })).resolves.toMatchObject({ x: 1 })
        })
    })

    it('uses 0.7 when the skill declares no temperature', async () => {
        const chat = respondWith('{"x":1}')
        await new Skill({ name: 's', systemInstructions: {} }).run({ ...base })

        expect(chat.mock.calls[0][0].temperature).toBe(0.7)
    })

    describe('responses with several text blocks', () => {
        const first = JSON.stringify({ reasoning: 'r1', state: {}, actions: [{ tool: 't', arguments: {} }] })
        const second = JSON.stringify({ reasoning: 'r2', state: {}, actions: [{ tool: 'respond', arguments: { answer: 'invented' } }] })

        it('uses the first complete block, leaves a trace and reports how many arrived', async () => {
            respondWith(first + second, { textBlocks: [first, second], model: 'm1', provider: 'p1' })
            const chat = { addTrace: jest.fn() } as any
            const result: any = await new Skill({ name: 's', version: '9.9.9', systemInstructions: {} }).run({ ...base, chat, tools: [{ name: 't', description: 'd', parameters: {} }] })

            expect(result.reasoning).toBe('r1')
            expect(result.callInfo).toEqual({ skill: 's', skillVersion: '9.9.9', mode: 'plain_chat', model: 'm1', provider: 'p1', blocks: 2 })
            expect(chat.addTrace).toHaveBeenCalledWith({ node: 's', reasoning: expect.stringContaining('2 text blocks; block 1 was used') })
        })

        it('returns a snippet of the text when the response has no JSON at all', async () => {
            respondWith('Just a plain sentence. '.repeat(30))
            const result: any = await new Skill({ name: 's', systemInstructions: {} }).run({ ...base })

            expect(result.callInfo.rawText).toHaveLength(300)
            expect(result.callInfo.rawText.startsWith('Just a plain sentence.')).toBe(true)
        })

        it('leaves no snippet when the response has JSON', async () => {
            respondWith('{"x":1}')
            const result: any = await new Skill({ name: 's', systemInstructions: {} }).run({ ...base })

            expect(result.callInfo.rawText).toBeUndefined()
        })

        it('leaves no warning when there is a single block', async () => {
            respondWith('{"x":1}')
            const chat = { addTrace: jest.fn() } as any
            const result: any = await new Skill({ name: 's', systemInstructions: {} }).run({ ...base, chat })

            expect(result.callInfo.blocks).toBe(1)
            expect(chat.addTrace).toHaveBeenCalledTimes(1)
        })
    })

    describe('with a tool catalog', () => {
        const tools = [{ name: 't', description: 'd', parameters: { type: 'object' } }]

        it('sends it as text in a second system message by default, with no native tools and no tool choice', async () => {
            const chat = respondWith('{"x":1}')
            await new Skill({ name: 's', systemInstructions: { r: 1 } }).run({ ...base, tools })

            const sent = chat.mock.calls[0][0]

            expect(sent.tools).toBeUndefined()
            expect(sent.toolChoice).toBeUndefined()
            expect(sent.messages.map(message => message.role)).toEqual(['system', 'system', 'user'])
            expect(JSON.parse(sent.messages[1].content as string)).toEqual({ tool_list: tools })
        })

        it('sends no tool list when there are no tools', async () => {
            const chat = respondWith('{"x":1}')
            await new Skill({ name: 's', systemInstructions: {} }).run({ ...base })

            expect(chat.mock.calls[0][0].messages.map(message => message.role)).toEqual(['system', 'user'])
        })

        it('declares them natively with tool choice none only in legacy_tools_off', async () => {
            const chat = respondWith('{"x":1}')
            await new Skill({ name: 's', systemInstructions: {} }).run({ ...base, tools, mode: 'legacy_tools_off' })

            expect(chat.mock.calls[0][0]).toMatchObject({ tools, toolChoice: 'none' })
            expect(chat.mock.calls[0][0].messages.map(message => message.role)).toEqual(['system', 'user'])
        })

        it('uses the mode of the skill unless the run overrides it', async () => {
            const chat = respondWith('{"x":1}')
            const skill = new Skill({ name: 's', systemInstructions: {}, mode: 'legacy_tools_off' })

            await skill.run({ ...base, tools })
            await skill.run({ ...base, tools, mode: 'plain_chat' })

            expect(chat.mock.calls[0][0].toolChoice).toBe('none')
            expect(chat.mock.calls[1][0].toolChoice).toBeUndefined()
        })

        it('defaults to plain_chat', () => {
            expect(new Skill({ name: 's', systemInstructions: {} }).mode).toBe('plain_chat')
        })
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

    it.each(['OUTPUT_FORMAT', 'NEVER_EMPTY', 'STATE', 'LEARNED', 'ACTIONS', 'REFERENCES', 'WORKSPACE', 'CONFIRMATION', 'ARGUMENT_SOURCES', 'IDENTIFIERS'])('keeps the %s rule', rule => {
        expect(instructions).toContain(`${rule}:`)
    })

    it('forbids empty actions in the rule, the output format and the closing line', () => {
        expect(instructions).toContain("'actions' (never empty)")
        expect(instructions).toContain('NEVER_EMPTY:')
        expect(instructions).toContain('with at least one action')
    })

    it('teaches the find option of read_context', () => {
        expect(instructions).toMatch(/\\"find\\"|find/)
    })
})
