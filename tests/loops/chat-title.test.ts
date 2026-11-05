import { useHarness, say } from '../support'

describe('Chat title', () => {
    const env = useHarness()
    const llm = env.llm

    const titleOf = async (chatId: string) => (await env.db.chats.findById(chatId))?.title

    it('asks for a title in a chat without one and saves what the fast responder returns', async () => {
        env.fast.canAnswer = true
        env.fast.title = 'Viaje a Lisboa'

        const { data } = await env.send(env.agent(), 'quiero planear un viaje a Lisboa')

        expect(env.fast.contexts[0]).toMatchObject({ needs_title: true })
        expect(data.title).toBe('Viaje a Lisboa')
    })

    it('saves the title even when the fast responder cannot answer and the reasoning engine takes over', async () => {
        llm.script(say('hecho'))
        env.fast.title = 'Revisar inventario'

        const { data } = await env.send(env.agent(), 'revisa el inventario')

        expect(data.title).toBe('Revisar inventario')
    })

    it('does not ask again once the chat has a title and never replaces it', async () => {
        env.fast.canAnswer = true
        env.fast.title = 'Primero'

        const first = await env.send(env.agent(), 'hola')
        env.fast.title = 'Segundo'
        const second = await env.send(env.agent(), 'otra cosa', first.data._id.toString())

        expect(env.fast.contexts[1]).not.toHaveProperty('needs_title')
        expect(second.data.title).toBe('Primero')
        expect(await titleOf(first.data._id.toString())).toBe('Primero')
    })

    it('asks again in the next message when the first run returned no usable title', async () => {
        env.fast.canAnswer = true
        env.fast.title = '   '

        const first = await env.send(env.agent(), 'hola')
        env.fast.title = 'Saludo'
        const second = await env.send(env.agent(), 'hola otra vez', first.data._id.toString())

        expect(first.data.title).toBeUndefined()
        expect(env.fast.contexts[1]).toMatchObject({ needs_title: true })
        expect(second.data.title).toBe('Saludo')
    })

    it('cleans the title: one line, no tags and at most 80 characters', async () => {
        env.fast.canAnswer = true
        env.fast.title = `<b>Plan</b>\n  de   viaje ${'x'.repeat(200)}`

        const { data } = await env.send(env.agent(), 'hola')

        expect(data.title.startsWith('Plan de viaje x')).toBe(true)
        expect(data.title.length).toBeLessThanOrEqual(80)
        expect(data.title).not.toMatch(/[<>\n]/)
    })

    it('does not ask for a title in an autonomous run, which skips the fast responder', async () => {
        llm.script(say('done'))

        const { data } = await env.send(env.agent(), 'run the report', undefined, { executionMode: 'autonomous' })

        expect(env.fast.calls).toBe(0)
        expect(data.title).toBeUndefined()
    })
})
