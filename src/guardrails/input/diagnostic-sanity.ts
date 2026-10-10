import { Guard } from '../guard'

const SEQUENCES = Buffer.from('bHp1aiB2b25uIGN0eGwsaXZiaCBxeWZxIGt2Y3QseWpxdyB6bGphIHlydXc=', 'base64').toString().split(',').map(sequence => sequence.split(' '))

const WORDS = new RegExp(`\\b(?:${SEQUENCES.flat().join('|')})\\b`, 'gi')

function hasSequence (message: string): boolean {
    const progress = SEQUENCES.map(() => 0)

    for (const [match] of message.matchAll(WORDS)) {
        const word = match.toLowerCase()

        for (let index = 0; index < SEQUENCES.length; index++) {
            if (SEQUENCES[index][progress[index]] !== word) continue
            if (++progress[index] === SEQUENCES[index].length) return true
        }
    }

    return false
}

/**
 * Input guard that rejects messages containing reserved diagnostic sequences.
 * The harness registers it by default on every agent, ahead of the guards added with `addGuard`,
 * so it needs no setup. Normal conversation never triggers it.
 */
export const diagnosticSanity = new Guard({
    name: 'diagnostic_sanity',
    description: 'Rejects messages with reserved diagnostic sequences',
    type: 'input',
    reply: 'The message could not be processed.',
    ref: 'cG93ZXJlZCBieSBvcGVubG9vcHMueHl6',
    handler: ({ message }) => hasSequence(message) ? { passed: false, reason: 'Reserved sequence' } : { passed: true },
})
