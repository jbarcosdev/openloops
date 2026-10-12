import { buildModeCall, readModeResponse } from '@skills/call-modes'
import type { LLMMessage, LLMResponse } from '@clients/llm-types'

const tools = [
    { name: 't_search', description: 'search', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
    { name: 'respond', description: 'answer', parameters: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] } },
]

const assistant = (body: Record<string, any>): LLMMessage => ({ role: 'assistant', content: JSON.stringify(body) })
const user = (body: Record<string, any>): LLMMessage => ({ role: 'user', content: JSON.stringify(body) })

const conversation: LLMMessage[] = [
    { role: 'user', content: '{"INPUT":{"user_message":"hi"}}' },
    assistant({ reasoning: 'r1', state: { objective: 'o' }, actions: [{ tool: 't_search', arguments: { q: 'a' } }, { tool: 't_search', arguments: { q: 'b' } }] }),
    user({ OBSERVATIONS: [{ ref: '1_1', status: 'completed' }, { ref: '1_2', status: 'completed' }], HARNESS: { budget: { turns_left: 5 } } }),
]

const base = { skill: 's', systemInstructions: { rule: 1 }, systemRole: true, conversation, tools }

const reply = (extra: Partial<LLMResponse>): LLMResponse => ({ text: '', toolCalls: [], stopReason: 'stop', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costInUsd: 0 }, ...extra })

describe('call modes', () => {
    describe('plain_chat', () => {
        const call = buildModeCall({ ...base, mode: 'plain_chat' })

        it('sends the catalog as text and keeps the conversation untouched', () => {
            expect(call.tools).toBeUndefined()
            expect(call.toolChoice).toBeUndefined()
            expect(call.messages.map(message => message.role)).toEqual(['system', 'system', 'user', 'assistant', 'user'])
            expect(JSON.parse(call.messages[1].content as string).tool_list.map((tool: any) => tool.name)).toEqual(['t_search', 'respond'])
            expect(call.messages.slice(2)).toEqual(conversation)
        })

        it('reads the text as is', () => {
            expect(readModeResponse('plain_chat', 's', reply({ text: '{"a":1}' }))).toEqual({ text: '{"a":1}', blocks: 1, chosen: 0 })
        })
    })

    describe('legacy_tools_off', () => {
        it('declares the tools and disables tool calls', () => {
            const call = buildModeCall({ ...base, mode: 'legacy_tools_off' })

            expect(call.tools).toEqual(tools)
            expect(call.toolChoice).toBe('none')
            expect(call.messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
        })
    })

    describe('function_calling', () => {
        const call = buildModeCall({ ...base, mode: 'function_calling' })

        it('forces a single strict step tool whose actions are limited to the catalog', () => {
            expect(call.toolChoice).toBe('required')
            expect(call.tools).toHaveLength(1)
            expect(call.tools![0]).toMatchObject({ name: 'step', strict: true })
            expect(call.tools![0].parameters.properties.actions.items.properties.tool.enum).toEqual(['t_search', 'respond'])
        })

        it('adds the delivery instruction and the catalog text to the system messages', () => {
            expect(JSON.parse(call.messages[0].content as string)).toMatchObject({ rule: 1, delivery: expect.stringContaining('"step"') })
            expect(JSON.parse(call.messages[1].content as string).tool_list).toHaveLength(2)
        })

        it('rewrites the history as a step call followed by its result', () => {
            const [, , opening, request, result] = call.messages

            expect(opening.role).toBe('user')
            expect(request).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'step_1', name: 'step' }] })
            expect((request as any).toolCalls[0].arguments.actions).toEqual([{ tool: 't_search', arguments_json: '{"q":"a"}' }, { tool: 't_search', arguments_json: '{"q":"b"}' }])
            expect(result).toMatchObject({ role: 'tool', toolCallId: 'step_1', toolName: 'step', content: conversation[2].content })
        })

        it('turns the step call back into the JSON object of the text modes', () => {
            const { text } = readModeResponse('function_calling', 's', reply({
                toolCalls: [{ id: 'c', name: 'step', arguments: { reasoning: 'r', state: { next: 'n' }, learned: [], actions: [{ tool: 'respond', arguments_json: '{"answer":"done"}' }] } }],
            }))

            expect(JSON.parse(text)).toEqual({ reasoning: 'r', state: { next: 'n' }, learned: [], actions: [{ tool: 'respond', arguments: { answer: 'done' } }] })
        })

        it('recovers arguments wrapped in extra text and rejects ones that are not JSON', () => {
            const make = (arguments_json: string) => reply({ toolCalls: [{ id: 'c', name: 'step', arguments: { reasoning: 'r', state: {}, learned: [], actions: [{ tool: 'respond', arguments_json }] } }] })

            expect(JSON.parse(readModeResponse('function_calling', 's', make('Here: {"answer":"x"}')).text).actions[0].arguments).toEqual({ answer: 'x' })
            expect(() => readModeResponse('function_calling', 's', make('nope'))).toThrow('not valid JSON')
        })

        it('requires tools and a system role', () => {
            expect(() => buildModeCall({ ...base, tools: [], mode: 'function_calling' })).toThrow('requires tools')
            expect(() => buildModeCall({ ...base, systemRole: false, mode: 'function_calling' })).toThrow('requires systemRole')
        })

        it('keeps an assistant message that is not a skill response as it is', () => {
            const odd = buildModeCall({ ...base, conversation: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'plain words' }, { role: 'user', content: 'y' }], mode: 'function_calling' })

            expect(odd.messages.slice(2).map(message => message.role)).toEqual(['user', 'assistant', 'user'])
        })
    })

    describe('function_calling_split', () => {
        const call = buildModeCall({ ...base, mode: 'function_calling_split' })

        it('declares reflect and every catalog tool as strict and forces a tool call', () => {
            expect(call.toolChoice).toBe('required')
            expect(call.tools!.map(tool => tool.name)).toEqual(['reflect', 't_search', 'respond'])
            expect(call.tools!.every(tool => tool.strict)).toBe(true)
        })

        it('rewrites the history as reflect plus one call per action, each with its own observation', () => {
            const messages = call.messages.slice(3)

            expect(messages[0]).toMatchObject({ role: 'assistant', toolCalls: [{ name: 'reflect' }, { name: 't_search' }, { name: 't_search' }] })
            expect(messages.slice(1).map(message => (message as any).content)).toEqual([
                'ok',
                JSON.stringify({ ref: '1_1', status: 'completed' }),
                JSON.stringify({ observation: { ref: '1_2', status: 'completed' }, HARNESS: { budget: { turns_left: 5 } } }),
            ])
        })

        it('puts the whole feedback in the last result when observations do not match the actions', () => {
            const odd = buildModeCall({ ...base, mode: 'function_calling_split', conversation: [conversation[0], conversation[1], user({ OBSERVATIONS: [{ ref: '1_1', status: 'failed' }] })] })
            const results = odd.messages.filter(message => message.role === 'tool').map(message => (message as any).content)

            expect(results[0]).toBe('ok')
            expect(results[1]).toBe('ok')
            expect(JSON.parse(results[2])).toEqual({ OBSERVATIONS: [{ ref: '1_1', status: 'failed' }] })
        })

        it('folds reflect and the action calls back into the JSON object', () => {
            const { text } = readModeResponse('function_calling_split', 's', reply({
                toolCalls: [{ id: '1', name: 'reflect', arguments: { reasoning: 'r', state: { next: 'n' }, learned: [] } }, { id: '2', name: 't_search', arguments: { q: 'z' } }],
            }))

            expect(JSON.parse(text)).toEqual({ reasoning: 'r', state: { next: 'n' }, learned: [], actions: [{ tool: 't_search', arguments: { q: 'z' } }] })
        })
    })

    describe('responses with several text blocks', () => {
        const search = JSON.stringify({ reasoning: 'search', state: { next: 'n' }, actions: [{ tool: 'web_search', arguments: { query: 'btc' } }] })
        const invented = JSON.stringify({ reasoning: 'no results', state: { next: 'n' }, actions: [{ tool: 'respond', arguments: { answer: 'I could not search' } }] })
        const analysis = JSON.stringify({ reasoning: 'I read the results', state: { next: 'answer' }, actions: [] })
        const answer = JSON.stringify({ reasoning: 'done', state: { next: 'none' }, actions: [{ tool: 'respond', arguments: { answer: 'About 83,800 USD' } }] })
        const read = (blocks: string[], expectActions = true) => readModeResponse('plain_chat', 's', reply({ text: blocks.join(''), textBlocks: blocks }), { expectActions })

        it('uses the first block when two complete ones arrive, since the second is an invented continuation', () => {
            expect(read([search, invented])).toEqual({ text: search, blocks: 2, chosen: 0 })
        })

        it('uses the first block and ignores a plain text final_answer after two commentary blocks', () => {
            expect(read([search, invented, 'I could not verify the price'])).toEqual({ text: search, blocks: 3, chosen: 0 })
        })

        it('skips a first block that has no actions and uses the one that does', () => {
            expect(read([analysis, answer])).toEqual({ text: answer, blocks: 2, chosen: 1 })
        })

        it('falls back to the first block with a JSON object when none has actions', () => {
            expect(read(['thinking out loud', analysis, analysis]).chosen).toBe(1)
            expect(read(['one', 'two']).chosen).toBe(0)
        })

        it('accepts any JSON object when the skill does not expect actions', () => {
            const verdict = JSON.stringify({ can_answer: false, answer: '' })
            expect(read(['note', verdict], false)).toEqual({ text: verdict, blocks: 2, chosen: 1 })
        })

        it('reads a response without block information as one block', () => {
            expect(readModeResponse('legacy_tools_off', 's', reply({ text: search }), { expectActions: true })).toEqual({ text: search, blocks: 1, chosen: 0 })
        })
    })

    it('rejects an unknown mode', () => {
        expect(() => buildModeCall({ ...base, mode: 'nope' as any })).toThrow('unknown mode')
    })
})
