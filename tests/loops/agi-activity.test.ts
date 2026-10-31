import { useHarness, warehouseTools, act, say } from '../support'

describe('AgiLoop activity', () => {
    const env = useHarness()
    const llm = env.llm
    let w: ReturnType<typeof warehouseTools>

    beforeEach(() => {
        w = warehouseTools()
    })

    const run = async (message = 'find item 3') => {
        const seen: string[] = []
        const agent = env.agent(w.tools)
        agent.onActivity(activity => seen.push(activity))
        await env.send(agent, message)
        return seen
    }

    it('shows the activity written by the model from its answer until the next one', async () => {
        llm.script(
            { activity: 'Buscando tus gastos de vuelos', actions: [act('t_search', { q: 'warehouse' })] },
            { activity: 'Sumando los cargos para darte el total', actions: [act('t_get', { id: '{{step_1_1.output.results[3].id}}' })] },
            say('Listo'),
        )

        const seen = await run()

        expect(seen).toEqual([
            'Buscando tus gastos de vuelos',
            'Sumando los cargos para darte el total',
        ])
    })

    it('uses the activity of the fast responder while the reasoning engine thinks, when it cannot answer', async () => {
        env.fast.activity = 'Voy a buscar tus gastos de vuelos de agosto'
        llm.script(say('Listo'))

        const seen = await run()

        expect(seen).toEqual([
            'Voy a buscar tus gastos de vuelos de agosto',
        ])
    })

    it('does not use the activity of the fast responder when it answers by itself', async () => {
        env.fast.canAnswer = true
        env.fast.activity = 'Voy a buscar algo'

        const seen = await run('hola')

        expect(seen).not.toContain('Voy a buscar algo')
    })

    it('keeps the last activity of the model when a later turn gives none, so the user does not go back to a generic one', async () => {
        llm.script(
            { activity: 'Buscando tus gastos de vuelos', actions: [act('t_search', { q: 'warehouse' })] },
            { actions: [act('t_search', { q: 'warehouse' })] },
            say('Listo'),
        )

        const seen = await run()

        expect(seen).toEqual(['Buscando tus gastos de vuelos'])
    })

    it('keeps the last activity of the model when the next response is not valid, while the model tries again', async () => {
        llm.script(
            { activity: 'Buscando tus gastos de vuelos', actions: [act('t_search', { q: 'warehouse' })] },
            { raw: 'this is not a JSON object' },
            say('Listo'),
        )

        const seen = await run()

        expect(seen).toEqual(['Buscando tus gastos de vuelos'])
        expect(env.tasks()[0].turns).toHaveLength(3)
    })

    it('tells nothing when the model gives none or gives something unusable', async () => {
        llm.script(
            { activity: 42, actions: [act('t_search', { q: 'warehouse' })] },
            { activity: '   ', actions: [act('t_search', { q: 'warehouse' })] },
            { activity: 'stopped', actions: [act('t_search', { q: 'warehouse' })] },
            say('Listo'),
        )

        const seen = await run()

        expect(seen).toEqual([])
    })

    it('cleans the text before showing it and keeps it short', async () => {
        llm.script(
            { activity: '**Buscando**\ntus gastos de agosto', actions: [act('t_search', { q: 'warehouse' })] },
            say('Listo'),
        )

        const seen = await run()

        expect(seen).toContain('Buscando tus gastos de agosto')
        expect(seen.every(activity => activity.length <= 83 && !activity.includes('\n'))).toBe(true)
    })

    it('records the activity in the turn, to audit what the user was shown', async () => {
        llm.script(
            { activity: 'Buscando tus gastos de vuelos', actions: [act('t_search', { q: 'warehouse' })] },
            say('Listo'),
        )

        await run()

        const [task] = env.tasks()
        expect(task.turns[0].activity).toBe('Buscando tus gastos de vuelos')
        expect(task.turns[1].activity).toBeUndefined()
    })

    it('asks the model for the activity in the language of the conversation and without technical terms', async () => {
        llm.script(say('Listo'))

        await run()

        const rules = JSON.stringify(llm.call(0).messages)
        expect(rules).toContain('ACTIVITY')
        expect(rules).toContain('Never mention tool names')
    })

    it('does not carry the activity of a run to the next one of the same chat', async () => {
        llm.script(
            { activity: 'Buscando tus gastos', actions: [act('t_search', { q: 'warehouse' })] },
            say('Listo'),
            say('Otra vez'),
        )
        const agent = env.agent(w.tools)
        const second: string[] = []

        const first = await env.send(agent, 'uno')
        const unsubscribe = agent.onActivity(activity => second.push(activity))
        await env.send(env.agent(w.tools), 'dos', first.data._id.toString())
        unsubscribe()

        expect(second).not.toContain('Buscando tus gastos')
    })
})
