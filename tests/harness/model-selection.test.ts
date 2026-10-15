import { secretManager } from '@common/utils/secret-manager'
import { Agent } from '@harness/index'
import { AgiLoop } from '@loops/agi/loop'
import { LLMClient } from '@clients/llm/llm-client'
import { backendFallbackModel, resolveModel, toModelRef } from '@clients/llm/model-resolution'
import { useHarness, say, act } from '../support'

const HAIKU = { provider: 'anthropic', model: 'claude-haiku-5-5' }
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5-5' }
const GPT = { provider: 'openai', model: 'gpt-4o-mini' }
const GEMINI = { provider: 'google', model: 'gemini-2.5-flash' }

const settings = (values: Record<string, string>) => jest.spyOn(secretManager, 'get').mockImplementation((key: string) => values[key] ?? '')

describe('resolving the model', () => {
    afterEach(() => jest.restoreAllMocks())

    it('takes the first level that has a model', () => {
        expect(resolveModel({ run: GPT, chat: SONNET, user: GEMINI, agent: HAIKU })).toEqual({ ...GPT, source: 'run' })
        expect(resolveModel({ chat: SONNET, user: GEMINI, agent: HAIKU })).toEqual({ ...SONNET, source: 'chat' })
        expect(resolveModel({ user: GEMINI, agent: HAIKU })).toEqual({ ...GEMINI, source: 'user' })
        expect(resolveModel({ agent: GPT })).toEqual({ ...GPT, source: 'agent' })
    })

    it('uses the fallback of the backend, then the one of the client', () => {
        const spy = settings({ LLM_FALLBACK_PROVIDER: 'openai', LLM_FALLBACK_MODEL: 'gpt-4o-mini' })
        expect(resolveModel({})).toEqual({ ...GPT, source: 'backend' })

        spy.mockRestore()
        expect(resolveModel({})).toEqual({ ...HAIKU, source: 'client' })
    })

    it('ignores a fallback of the backend that is not complete', () => {
        settings({ LLM_FALLBACK_PROVIDER: 'openai' })
        expect(backendFallbackModel()).toBeUndefined()
        expect(resolveModel({}).source).toBe('client')

        settings({ LLM_FALLBACK_MODEL: 'gpt-4o-mini' })
        expect(backendFallbackModel()).toBeUndefined()
    })

    it('builds a pair only from a provider and a model that are both set', () => {
        expect(toModelRef({ provider: ' openai ', model: 'gpt-4o-mini' })).toEqual(GPT)
        expect(toModelRef({ provider: 'openai' })).toBeUndefined()
        expect(toModelRef({ provider: '', model: 'x' })).toBeUndefined()
        expect(toModelRef(null)).toBeUndefined()
    })

    it('knows whether a model is in the catalog', async () => {
        jest.resetModules()
        jest.doMock('@earendil-works/pi-ai/providers/all', () => ({
            builtinModels: () => ({ getModel: (provider: string, model: string) => provider === 'anthropic' && model === 'claude-haiku-5-5' ? { id: model } : undefined }),
        }), { virtual: true })

        const { isKnownModel: known } = jest.requireActual('@clients/llm/model-resolution')

        expect(await known('anthropic', 'claude-haiku-5-5')).toBe(true)
        expect(await known('anthropic', 'no-such-model')).toBe(false)
        expect(await known('no-such-provider', 'x')).toBe(false)
    })
})

describe('the model of the client', () => {
    const models = { getModel: jest.fn(), complete: jest.fn(), completeSimple: jest.fn() }

    beforeEach(() => {
        jest.resetModules()
        models.getModel.mockReset().mockReturnValue({ id: 'm', api: 'x', provider: 'p' })
        models.complete.mockReset().mockResolvedValue({ role: 'assistant', content: [{ type: 'text', text: '{}' }], stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } }, model: 'm' })
    })

    afterEach(() => jest.restoreAllMocks())

    const chat = (extra: Record<string, any> = {}) => {
        jest.doMock('@earendil-works/pi-ai/providers/all', () => ({ builtinModels: () => models }), { virtual: true })

        return new LLMClient().chat({ origin: 't', sessionId: 's', answerId: 'a', messages: [{ role: 'user', content: 'hi' }], ...extra })
    }

    it('uses the preference of the user when no model is given', async () => {
        await chat({ currentUser: { preferences: { defaultModel: GEMINI } } })

        expect(models.getModel).toHaveBeenCalledWith('google', 'gemini-2.5-flash')
    })

    it('prefers the model that is given to the preference', async () => {
        await chat({ provider: 'openai', modelName: 'gpt-4o-mini', currentUser: { preferences: { defaultModel: GEMINI } } })

        expect(models.getModel).toHaveBeenCalledWith('openai', 'gpt-4o-mini')
    })

    it('uses the fallback of the backend when there is no preference', async () => {
        settings({ LLM_FALLBACK_PROVIDER: 'openai', LLM_FALLBACK_MODEL: 'gpt-4o-mini' })
        await chat()

        expect(models.getModel).toHaveBeenCalledWith('openai', 'gpt-4o-mini')
    })

    it('does not accept only a provider or only a model', async () => {
        await expect(chat({ provider: 'openai' })).rejects.toThrow(/together/)
        await expect(chat({ modelName: 'gpt-4o-mini' })).rejects.toThrow(/together/)
    })
})

describe('the model of a run', () => {
    const env = useHarness()

    const run = (agent: Agent, chatId?: string, model?: { provider: string, model: string }, message = 'hello') =>
        agent.run({
            input: { message, ...(chatId ? { chatId } : {}) },
            ...(model ? { options: { modelProvider: model.provider, modelName: model.model } } : {}),
            currentUser: env.user,
        }) as Promise<{ data: any, error?: string }>

    const agent = (fallbackModel?: { provider: string, model: string }) => new Agent({ loop: new AgiLoop(), ...(fallbackModel ? { fallbackModel } : {}) })
    const used = (index: number) => ({ provider: env.llm.call(index).provider, model: env.llm.call(index).modelName })

    beforeEach(() => {
        ;(env.user as any).preferences = undefined
    })

    afterEach(() => jest.restoreAllMocks())

    it('uses the model of the run and saves it in the chat', async () => {
        env.llm.script(say('hi'))
        const { data } = await run(agent(), undefined, GPT)

        expect(used(0)).toEqual(GPT)
        expect(data.settings).toMatchObject({ modelProvider: 'openai', modelName: 'gpt-4o-mini' })
    })

    it('keeps using the last model when the next run does not send one', async () => {
        env.llm.script(say('one'), say('two'))
        const first = await run(agent(), undefined, GPT)
        await run(agent(), first.data._id.toString())

        expect(used(1)).toEqual(GPT)
    })

    it('uses the last model that was sent, even if it changes between runs', async () => {
        env.llm.script(say('one'), say('two'), say('three'))
        const first = await run(agent(), undefined, GPT)
        const id = first.data._id.toString()
        await run(agent(), id, GEMINI)
        await run(agent(), id)

        expect([used(0), used(1), used(2)]).toEqual([GPT, GEMINI, GEMINI])
    })

    it('uses the preference of the user the first time and saves it', async () => {
        ;(env.user as any).preferences = { defaultModel: SONNET }
        env.llm.script(say('one'), say('two'))
        const first = await run(agent(HAIKU))

        expect(used(0)).toEqual(SONNET)
        expect(first.data.settings).toMatchObject({ modelProvider: 'anthropic', modelName: 'claude-sonnet-5-5' })

        ;(env.user as any).preferences = { defaultModel: GEMINI }
        await run(agent(HAIKU), first.data._id.toString())

        expect(used(1)).toEqual(SONNET)
    })

    it('uses the new preference in a chat that starts after it changed', async () => {
        ;(env.user as any).preferences = { defaultModel: GEMINI }
        env.llm.script(say('one'))
        await run(agent())

        expect(used(0)).toEqual(GEMINI)
    })

    it('uses the fallback of the agent when the user has no preference, and saves it', async () => {
        env.llm.script(say('one'))
        const { data } = await run(agent(GPT))

        expect(used(0)).toEqual(GPT)
        expect(data.settings).toMatchObject({ modelProvider: 'openai', modelName: 'gpt-4o-mini' })
    })

    it('uses the fallback of the backend and then the one of the client', async () => {
        const spy = settings({ LLM_FALLBACK_PROVIDER: 'google', LLM_FALLBACK_MODEL: 'gemini-2.5-flash' })
        env.llm.script(say('one'))
        await run(agent())
        expect(used(0)).toEqual(GEMINI)

        spy.mockRestore()
        env.llm.script(say('two'))
        await run(agent())
        expect(used(1)).toEqual(HAIKU)
    })

    it('gives the model to every skill that runs, not only to the reasoning engine', async () => {
        ;(env.user as any).preferences = { defaultModel: SONNET }
        env.llm.script({ actions: [act('ask_user', { question: 'Which color?' })] }, say('done'))
        await env.agent().run({ input: { message: 'paint it' }, options: { executionMode: 'autonomous' }, currentUser: env.user })

        expect(env.autonomy.calls[0]).toMatchObject({ provider: 'anthropic', modelName: 'claude-sonnet-5-5' })
    })

    it('refuses a run that sends only one of the two', async () => {
        const result = await agent().run({ input: { message: 'hi' }, options: { modelName: 'gpt-4o-mini' }, currentUser: env.user }) as any

        expect(result.error).toMatch(/both modelProvider and modelName/)
        expect(env.llm.calls).toHaveLength(0)
    })

    it('refuses a fallback model that is not complete', () => {
        expect(() => new Agent({ loop: new AgiLoop(), fallbackModel: { provider: 'openai', model: '' } })).toThrow(/fallbackModel/)
    })
})
