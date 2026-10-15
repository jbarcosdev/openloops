import { LLMClient } from '@clients/llm/llm-client'
import { LLMError } from '@clients/llm/llm-error'
import { secretManager } from '@common/utils/secret-manager'
import { Tool } from '@tools/tool'

const mockModels = {
    getModel: jest.fn(),
    complete: jest.fn(),
    completeSimple: jest.fn(),
}

jest.mock('@earendil-works/pi-ai/providers/all', () => ({
    builtinModels: () => mockModels,
}), { virtual: true })

const mockLangfuse = { flushAsync: jest.fn(), trace: jest.fn() }

jest.mock('langfuse', () => ({
    Langfuse: class {
        trace = (...args: any[]) => mockLangfuse.trace(...args)
        flushAsync = () => mockLangfuse.flushAsync()
    },
}))

const reply = () => ({
    role: 'assistant',
    content: [{ type: 'text', text: '{"ok":true}' }],
    stopReason: 'stop',
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { total: 0.25 } },
    responseId: 'resp-1',
    model: 'm',
})

const params = () => ({
    origin: 'test',
    sessionId: 's',
    answerId: 'a',
    messages: [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hi' }],
})

const never = () => new Promise(() => undefined)

const settings = (values: Record<string, string>) => jest.spyOn(secretManager, 'get').mockImplementation((key: string) => values[key] ?? '')

describe('timeout of the model call', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        ;(LLMClient as any).modelsWithoutTemperature.clear()
        mockModels.getModel.mockReset().mockReturnValue({ id: 'm', api: 'x', provider: 'p' })
        mockModels.complete.mockReset()
        mockModels.completeSimple.mockReset()
    })

    afterEach(() => {
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it('does not touch a call that answers in time', async () => {
        mockModels.complete.mockResolvedValue(reply())
        const response = await new LLMClient().chat(params())

        expect(response.stopReason).toBe('stop')
        expect(mockModels.complete).toHaveBeenCalledTimes(1)
        expect(mockModels.complete.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal)
    })

    it('cancels a call that does not answer in 60 seconds and tries again', async () => {
        mockModels.complete.mockImplementationOnce(never).mockResolvedValueOnce(reply())

        const pending = new LLMClient().chat(params())
        await jest.advanceTimersByTimeAsync(59999)
        expect(mockModels.complete).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(1)
        const response = await pending

        expect(response.stopReason).toBe('stop')
        expect(mockModels.complete).toHaveBeenCalledTimes(2)
        expect(mockModels.complete.mock.calls[0][2].signal.aborted).toBe(true)
        expect(mockModels.complete.mock.calls[1][2].signal.aborted).toBe(false)
    })

    it('gives up after three attempts with a timeout error', async () => {
        mockModels.complete.mockImplementation(never)

        const pending = new LLMClient().chat(params())
        const outcome = pending.catch((error: LLMError) => error)
        await jest.advanceTimersByTimeAsync(60000 * 3)
        const error = await outcome

        expect(error).toBeInstanceOf(LLMError)
        expect(error).toMatchObject({ code: 'LLM_TIMEOUT', isRetryable: true })
        expect(mockModels.complete).toHaveBeenCalledTimes(3)
    })

    it('uses the time set in LLM_CALL_TIMEOUT_MS', async () => {
        settings({ LLM_CALL_TIMEOUT_MS: '1000' })
        mockModels.complete.mockImplementationOnce(never).mockResolvedValueOnce(reply())

        const pending = new LLMClient().chat(params())
        await jest.advanceTimersByTimeAsync(1000)
        await pending

        expect(mockModels.complete).toHaveBeenCalledTimes(2)
    })

    it.each([['abc'], ['-5'], ['0'], ['1.5']])('falls back to 60 seconds when LLM_CALL_TIMEOUT_MS is %s', async value => {
        settings({ LLM_CALL_TIMEOUT_MS: value })
        mockModels.complete.mockImplementationOnce(never).mockResolvedValueOnce(reply())

        const pending = new LLMClient().chat(params())
        await jest.advanceTimersByTimeAsync(59999)
        expect(mockModels.complete).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(1)
        await pending
        expect(mockModels.complete).toHaveBeenCalledTimes(2)
    })

    it('does not retry an error that is not a timeout', async () => {
        mockModels.complete.mockRejectedValue(new Error('boom'))

        await expect(new LLMClient().chat(params())).rejects.toThrow('boom')
        expect(mockModels.complete).toHaveBeenCalledTimes(1)
    })
})

describe('flush of Langfuse', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        ;(LLMClient as any).modelsWithoutTemperature.clear()
        mockModels.getModel.mockReset().mockReturnValue({ id: 'm', api: 'x', provider: 'p' })
        mockModels.complete.mockReset().mockResolvedValue(reply())
        mockLangfuse.flushAsync.mockReset()
        mockLangfuse.trace.mockReset().mockReturnValue({ generation: () => ({ end: () => undefined }) })
        settings({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_BASE_URL: 'http://langfuse.local' })
    })

    afterEach(() => {
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it('answers even when Langfuse never finishes flushing', async () => {
        mockLangfuse.flushAsync.mockImplementation(never)

        const pending = new LLMClient().chat(params())
        await jest.advanceTimersByTimeAsync(5000)
        const response = await pending

        expect(response.stopReason).toBe('stop')
        expect(mockLangfuse.flushAsync).toHaveBeenCalled()
    })

    it('answers even when the flush fails', async () => {
        mockLangfuse.flushAsync.mockRejectedValue(new Error('langfuse down'))

        const response = await new LLMClient().chat(params())

        expect(response.stopReason).toBe('stop')
    })
})

describe('timeout of an MCP tool', () => {
    const mcpTool: any = { name: 'slow', description: 'd', inputSchema: { type: 'object', properties: {} } }
    const run = (client: any) => Tool.fromMcp(mcpTool, client, { namespace: 'srv' }).run({})

    afterEach(() => jest.restoreAllMocks())

    it('asks the client for 60 seconds, restarted by progress, by default', async () => {
        const callTool = jest.fn().mockResolvedValue({ content: [] })
        await run({ callTool })

        expect(callTool).toHaveBeenCalledWith({ name: 'slow', arguments: {} }, undefined, { timeout: 60000, resetTimeoutOnProgress: true })
    })

    it('uses the time set in MCP_TOOL_TIMEOUT_MS', async () => {
        settings({ MCP_TOOL_TIMEOUT_MS: '120000' })
        const callTool = jest.fn().mockResolvedValue({ content: [] })
        await run({ callTool })

        expect(callTool.mock.calls[0][2]).toMatchObject({ timeout: 120000 })
    })

    it('fails without retry and says the result is unknown when the server does not answer', async () => {
        const timeout: any = new Error('MCP error -32001: Request timed out')
        timeout.code = -32001
        const callTool = jest.fn().mockRejectedValue(timeout)

        await expect(run({ callTool })).rejects.toMatchObject({
            retryable: false,
            message: expect.stringMatching(/did not answer within 60 seconds.*may have been completed/),
        })
    })

    it('lets other errors through as they are', async () => {
        const callTool = jest.fn().mockRejectedValue(new Error('connection closed'))

        await expect(run({ callTool })).rejects.toMatchObject({ message: 'connection closed' })
    })
})
