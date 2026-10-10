import { Guard, inputGuards } from '@guardrails/index'

const { blockCode } = inputGuards

const run = (guard: Guard, message: string) => guard.run({ message } as any)

describe('Guard', () => {
    it('derives a stable 32 character reference from its type and name when none is given', () => {
        const make = (name: string) => new Guard({ name, type: 'input', reply: 'no', handler: () => ({ passed: true }) })

        expect(make('one').ref).toHaveLength(32)
        expect(make('one').ref).toBe(make('one').ref)
        expect(make('one').ref).not.toBe(make('two').ref)
        expect(Guard.refFor('input', 'one')).toBe(make('one').ref)
        expect(Guard.refFor('input', 'one')).not.toBe(Guard.refFor('output' as any, 'one'))
    })

    it('accepts a custom reference', () => {
        const guard = new Guard({ name: 'one', type: 'input', reply: 'no', ref: 'PI-001', handler: () => ({ passed: true }) })

        expect(guard.ref).toBe('PI-001')
    })

    it('runs its handler with the context and awaits async results', async () => {
        const guard = new Guard({ name: 'one', type: 'input', reply: 'no', handler: async ({ message }) => ({ passed: false, reason: message }) })

        expect(await run(guard, 'x')).toEqual({ passed: false, reason: 'x' })
    })

    it('returns a copy with another reply that keeps the rest', async () => {
        const changed = blockCode.withReply('nada de código')

        expect(changed).not.toBe(blockCode)
        expect(changed.reply).toBe('nada de código')
        expect(blockCode.reply).not.toBe('nada de código')
        expect(changed.ref).toBe(blockCode.ref)
        expect(changed.name).toBe(blockCode.name)
        expect(await run(changed, '```\nx\n```')).toMatchObject({ passed: false })
    })
})
