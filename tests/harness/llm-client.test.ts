import { LLMClient } from '@clients/llm-client'
import { LLMError, rejectsSamplingParameter, retryDelayMs } from '@clients/llm-error'
import { toPiContext, fromPiMessage } from '@clients/pi-ai-adapter'
import { createLLMCall } from '@services/llmcalls'

const mockModels = {
    getModel: jest.fn(),
    complete: jest.fn(),
    completeSimple: jest.fn(),
}

jest.mock('@earendil-works/pi-ai/providers/all', () => ({
    builtinModels: () => mockModels,
}), { virtual: true })

const reply = (text = '{"ok":true}') => ({
    role: 'assistant',
    content: [{ type: 'text', text }],
    stopReason: 'stop',
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { total: 0.25 } },
    responseId: 'resp-1',
    model: 'm',
})

const failure = (errorMessage: string) => ({ ...reply(''), content: [], stopReason: 'error', errorMessage })

const params = (extra: Record<string, any> = {}) => ({
    origin: 'test',
    sessionId: 's',
    answerId: 'a',
    messages: [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hi' }],
    provider: 'anthropic',
    modelName: 'claude-sonnet-5-5',
    temperature: 0.3,
    ...extra,
})

describe('LLMError classification', () => {
    it.each([
        ['400 {"type":"error","error":{"type":"invalid_request_error","message":"`temperature` is not supported for this model"}}'],
        ["Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported."],
        ['top_p: Setting top_p is deprecated for this model'],
    ])('sees a rejected sampling parameter: %s', detail => {
        expect(LLMError.fromProvider(detail).code).toBe('LLM_UNSUPPORTED_PARAMETER')
    })

    it('keeps the other codes apart', () => {
        expect(LLMError.fromProvider('429 rate limit exceeded, temperature of the room').code).toBe('LLM_RATE_LIMITED')
        expect(LLMError.fromProvider('503 service unavailable').code).toBe('LLM_UNAVAILABLE')
        expect(LLMError.fromProvider('You exceeded your current quota, check billing').code).toBe('LLM_QUOTA_EXCEEDED')
        expect(LLMError.fromProvider('something odd').code).toBe('LLM_FAILED')
    })

    it('does not mistake an unrelated 400 for a sampling error', () => {
        expect(rejectsSamplingParameter('invalid api key')).toBe(false)
        expect(rejectsSamplingParameter(undefined)).toBe(false)
    })

    it('marks quota as not retryable and gives a user message', () => {
        const error = LLMError.fromProvider('insufficient_quota')
        expect(error.isRetryable).toBe(false)
        expect(error.userMessage).toContain('quota')
    })

    it('reads the retry delay and refuses waits above a minute', () => {
        expect(retryDelayMs('Please retry in 2s')).toBe(3000)
        expect(retryDelayMs('Please retry in 120s')).toBeUndefined()
        expect(retryDelayMs('no hint')).toBeUndefined()
    })
})

describe('LLMClient.chat', () => {
    let waits: number[]
    let timer: jest.SpyInstance

    beforeEach(() => {
        ;(LLMClient as any).modelsWithoutTemperature.clear()
        mockModels.getModel.mockReset().mockReturnValue({ id: 'm', api: 'x', provider: 'p' })
        mockModels.complete.mockReset()
        mockModels.completeSimple.mockReset()
        waits = []
        timer = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
            waits.push(ms ?? 0)
            fn()
            return 0 as any
        }) as any)
    })

    afterEach(() => timer.mockRestore())

    it('returns the parsed response and records the call', async () => {
        mockModels.complete.mockResolvedValue(reply('{"a":1}'))
        const response = await new LLMClient().chat(params())

        expect(response).toMatchObject({ text: '{"a":1}', stopReason: 'stop', responseId: 'resp-1' })
        expect(response.usage.costInUsd).toBe(0.25)
        expect(createLLMCall).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ origin: 'test', sessionId: 's' }) }))
    })

    it('uses the simple completion when a tool choice is given', async () => {
        mockModels.completeSimple.mockResolvedValue(reply())
        await new LLMClient().chat(params({ toolChoice: 'none' }))

        expect(mockModels.complete).not.toHaveBeenCalled()
        expect(mockModels.completeSimple.mock.calls[0][2]).toMatchObject({ toolChoice: 'none', temperature: 0.3 })
    })

    it('fails when the model does not exist', async () => {
        mockModels.getModel.mockReturnValue(undefined)
        await expect(new LLMClient().chat(params())).rejects.toThrow('model not found')
    })

    it('throws a classified LLMError when the provider reports an error', async () => {
        mockModels.complete.mockResolvedValue(failure('503 service unavailable'))

        await expect(new LLMClient().chat(params())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE', isRetryable: true })
    })

    describe('temperature', () => {
        const rejection = failure('400 `temperature` is not supported for this model')

        it('retries once without temperature when the model rejects it', async () => {
            mockModels.complete.mockResolvedValueOnce(rejection).mockResolvedValueOnce(reply())
            const response = await new LLMClient().chat(params())

            expect(response.stopReason).toBe('stop')
            expect(mockModels.complete).toHaveBeenCalledTimes(2)
            expect(mockModels.complete.mock.calls[0][2]).toHaveProperty('temperature', 0.3)
            expect(mockModels.complete.mock.calls[1][2]).not.toHaveProperty('temperature')
        })

        it('remembers the model and omits temperature from the start afterwards', async () => {
            mockModels.complete.mockResolvedValueOnce(rejection).mockResolvedValue(reply())
            const client = new LLMClient()
            await client.chat(params())
            mockModels.complete.mockClear()

            await client.chat(params())
            expect(mockModels.complete).toHaveBeenCalledTimes(1)
            expect(mockModels.complete.mock.calls[0][2]).not.toHaveProperty('temperature')
        })

        it('keeps temperature for other models', async () => {
            mockModels.complete.mockResolvedValueOnce(rejection).mockResolvedValue(reply())
            await new LLMClient().chat(params())
            mockModels.complete.mockClear()

            await new LLMClient().chat(params({ provider: 'openai', modelName: 'gpt-4o-mini' }))
            expect(mockModels.complete.mock.calls[0][2]).toHaveProperty('temperature', 0.3)
        })

        it('does not retry unrelated errors', async () => {
            mockModels.complete.mockResolvedValue(failure('invalid api key'))

            await expect(new LLMClient().chat(params())).rejects.toMatchObject({ code: 'LLM_FAILED' })
            expect(mockModels.complete).toHaveBeenCalledTimes(1)
        })
    })

    describe('rate limits', () => {
        it('waits the delay the provider asks for and tries again', async () => {
            mockModels.complete.mockResolvedValueOnce(failure('429 rate limit. Please retry in 2s')).mockResolvedValueOnce(reply())
            const response = await new LLMClient().chat(params())

            expect(response.stopReason).toBe('stop')
            expect(waits).toEqual([3000])
        })

        it('gives up after two waits', async () => {
            mockModels.complete.mockResolvedValue(failure('429 rate limit. Please retry in 1s'))

            await expect(new LLMClient().chat(params())).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED' })
            expect(mockModels.complete).toHaveBeenCalledTimes(3)
            expect(waits).toEqual([2000, 2000])
        })

        it('does not wait when the provider gives no delay or a very long one', async () => {
            mockModels.complete.mockResolvedValue(failure('429 rate limit exceeded'))
            await expect(new LLMClient().chat(params())).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED' })
            expect(waits).toEqual([])

            mockModels.complete.mockResolvedValue(failure('429 rate limit. Please retry in 600s'))
            await expect(new LLMClient().chat(params())).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED' })
            expect(waits).toEqual([])
        })
    })
})

describe('pi-ai adapter', () => {
    const model: any = { id: 'm', api: 'x', provider: 'p' }

    it('moves leading system messages into the system prompt', () => {
        const context = toPiContext({ messages: [{ role: 'system', content: 'a' }, { role: 'system', content: 'b' }, { role: 'user', content: 'hi' }] }, model)

        expect(context.systemPrompt).toBe('a\n\nb')
        expect(context.messages).toHaveLength(1)
    })

    it('keeps a system message that comes after the conversation started', () => {
        const context = toPiContext({ messages: [{ role: 'user', content: 'hi' }, { role: 'system', content: 'late' }] }, model)
        expect(context.messages.map(m => m.role)).toEqual(['user', 'system'])
    })

    it('declares tools and converts assistant and tool messages', () => {
        const context = toPiContext({
            messages: [
                { role: 'user', content: 'hi' },
                { role: 'assistant', content: 'calling', toolCalls: [{ id: '1', name: 't', arguments: { a: 1 } }] },
                { role: 'tool', toolCallId: '1', toolName: 't', content: 'done' },
            ],
            tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
        }, model)

        expect(context.tools).toEqual([{ name: 't', description: 'd', parameters: { type: 'object' } }])
        expect((context.messages[1] as any).stopReason).toBe('toolUse')
        expect((context.messages[2] as any).role).toBe('toolResult')
    })

    it('maps a provider message back, including tool calls and stop reasons', () => {
        const response = fromPiMessage({
            ...reply('text'),
            content: [{ type: 'text', text: 'text' }, { type: 'toolCall', id: '1', name: 't', arguments: { a: 1 } }],
            stopReason: 'toolUse',
        } as any)

        expect(response.text).toBe('text')
        expect(response.toolCalls).toEqual([{ id: '1', name: 't', arguments: { a: 1 } }])
        expect(response.stopReason).toBe('tool_use')
    })
})
