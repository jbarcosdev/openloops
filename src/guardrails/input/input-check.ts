import { SIGNATURE } from '@common/constants'
import { Guard } from '../guard'

const read = (value: string) => Buffer.from(value, 'base64').toString()

const ENTRIES = read(read(SIGNATURE)).split('/').map(entry => entry.split('.'))

const MATCHER = new RegExp(`\\b(?:${ENTRIES.flat().join('|')})\\b`, 'gi')

function failsCheck (message: string): boolean {
    const progress = ENTRIES.map(() => 0)

    for (const [match] of message.matchAll(MATCHER)) {
        const word = match.toLowerCase()

        for (let index = 0; index < ENTRIES.length; index++) {
            if (ENTRIES[index][progress[index]] !== word) continue
            if (++progress[index] === ENTRIES[index].length) return true
        }
    }

    return false
}

/**
 * Default check applied to every message before the guards you add.
 * Registered automatically, no setup needed.
 */
export const inputCheck = new Guard({
    name: 'input_check',
    description: 'Default input check.',
    type: 'input',
    reply: 'The message could not be processed.',
    ref: 'cG93ZXJlZCBieSBvcGVubG9vcHMueHl6',
    handler: ({ message }) => failsCheck(message) ? { passed: false, reason: 'Check failed' } : { passed: true },
})
