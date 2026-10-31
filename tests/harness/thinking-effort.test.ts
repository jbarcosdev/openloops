import { Agent } from '@harness/index'
import { AgiLoop } from '@loops/agi/loop'
import { useHarness, say } from '../support'

describe('the thinking effort of a run', () => {
    const env = useHarness()

    const run = (chatId?: string, thinkingEffort?: string, message = 'hello') =>
        new Agent({ loop: new AgiLoop() }).run({
            input: { message, ...(chatId ? { chatId } : {}) },
            ...(thinkingEffort ? { options: { thinkingEffort: thinkingEffort as never } } : {}),
            currentUser: env.user,
        }) as Promise<{ data: any, error?: string }>

    it('uses the effort of the reasoning engine when none is sent, and saves nothing in the chat', async () => {
        env.llm.script(say('hi'))
        const { data } = await run()

        expect(env.llm.call(0).thinking).toBe('medium')
        expect(data.settings.thinkingEffort).toBeUndefined()
    })

    it('uses the effort of the run and saves it in the chat', async () => {
        env.llm.script(say('hi'))
        const { data } = await run(undefined, 'high')

        expect(env.llm.call(0).thinking).toBe('high')
        expect(data.settings.thinkingEffort).toBe('high')
    })

    it('keeps using the saved effort when the next run does not send one', async () => {
        env.llm.script(say('one'), say('two'))
        const first = await run(undefined, 'low')
        await run(first.data._id.toString())

        expect(env.llm.call(1).thinking).toBe('low')
    })

    it('uses the last effort that was sent, even if it changes between runs', async () => {
        env.llm.script(say('one'), say('two'), say('three'))
        const first = await run(undefined, 'high')
        await run(first.data._id.toString(), 'low')
        await run(first.data._id.toString())

        expect([env.llm.call(1).thinking, env.llm.call(2).thinking]).toEqual(['low', 'low'])
    })

    it.each([['off'], ['max'], ['HIGH'], ['']])('rejects the value "%s" before calling the model', async value => {
        const result = await new Agent({ loop: new AgiLoop() }).run({ input: { message: 'hello' }, options: { thinkingEffort: value as never }, currentUser: env.user }) as { error?: string }

        expect(result.error).toMatch(/thinkingEffort must be one of low, medium, high/)
        expect(env.llm.calls).toHaveLength(0)
    })

    it('ignores a saved value that is not allowed and falls back to the default', async () => {
        env.llm.script(say('one'), say('two'))
        const first = await run(undefined, 'high')
        env.db.chats.patch(first.data._id, { 'settings.thinkingEffort': 'extreme' })
        await run(first.data._id.toString())

        expect(env.llm.call(1).thinking).toBe('medium')
    })
})
