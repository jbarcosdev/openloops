import { Guard, inputGuards } from '@guardrails/index'

import { createBlockInputOversize } from '@guardrails/input/create-block-input-oversize'

const { blockCode, blockEmail, blockCard } = inputGuards

const run = (guard: Guard, message: string) => guard.run({ message } as any)

describe('library guards', () => {
    it.each([blockCode, blockEmail, blockCard])('$name has its own explicit 32 character reference', guard => {
        expect(guard.ref).toHaveLength(32)
        expect(guard.ref).not.toBe(Guard.refFor(guard.type, guard.name))
    })

    it('has different references for every guard', () => {
        expect(new Set([blockCode, blockEmail, blockCard].map(guard => guard.ref)).size).toBe(3)
    })
})

describe('blockCode', () => {
    it('blocks fenced code blocks', async () => {
        expect(await run(blockCode, 'mira esto:\n```js\nconsole.log(1)\n```')).toMatchObject({ passed: false, reason: 'Fenced code block' })
        expect(await run(blockCode, '~~~\nx\n~~~')).toMatchObject({ passed: false })
    })

    it('lets prose, error messages and inline snippets through', async () => {
        expect(await run(blockCode, 'Mi pedido llegó roto; quiero un reembolso.')).toEqual({ passed: true })
        expect(await run(blockCode, 'Error: Cannot read properties of undefined (reading id) at line 3')).toEqual({ passed: true })
        expect(await run(blockCode, 'use `npm install` please')).toEqual({ passed: true })
    })
})

describe('blockEmail', () => {
    it('blocks messages with an email address', async () => {
        expect(await run(blockEmail, 'escríbeme a ana.perez@example.com')).toMatchObject({ passed: false })
    })

    it('lets ordinary text through', async () => {
        expect(await run(blockEmail, 'hola, necesito ayuda @ las 5')).toEqual({ passed: true })
    })
})

describe('blockCard', () => {
    it('blocks valid card numbers with or without separators', async () => {
        expect(await run(blockCard, 'mi tarjeta es 4242 4242 4242 4242')).toMatchObject({ passed: false })
        expect(await run(blockCard, '4242-4242-4242-4242')).toMatchObject({ passed: false })
    })

    it('does not block numbers that fail the Luhn check or ordinary text', async () => {
        expect(await run(blockCard, 'pedido 1234 5678 9012 3456')).toEqual({ passed: true })
        expect(await run(blockCard, 'mi pedido es el 1234567890')).toEqual({ passed: true })
        expect(await run(blockCard, 'hola, necesito ayuda')).toEqual({ passed: true })
    })
})

describe('createBlockInputOversize', () => {
    it('blocks only above the limit and says by how much', async () => {
        const guard = createBlockInputOversize(5)

        expect(await run(guard, '12345')).toEqual({ passed: true })
        expect(await run(guard, '123456')).toEqual({ passed: false, reason: '6 of 5 characters' })
    })

    it('has an explicit reference that does not depend on the limit', () => {
        expect(createBlockInputOversize(1).ref).toBe(createBlockInputOversize(2).ref)
        expect(createBlockInputOversize(1).ref).toHaveLength(32)
    })
})
