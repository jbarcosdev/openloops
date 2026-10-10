import { Guard } from '../guard'

/**
 * Creates an input guard that blocks messages longer than `max` characters.
 * It counts string length, not tokens, so it is a safety net against runaway cost and oversized
 * payloads, not a context window limit.
 * Agents register one automatically. Set its limit with the `maxInputLength` option of the agent.
 */
export function createBlockInputOversize (max: number): Guard<'input'> {
    return new Guard({
        name: 'block_oversize',
        description: 'Blocks messages longer than the allowed size',
        type: 'input',
        reply: 'The message is too long.',
        ref: 'WW0Fl4RRYHEt/mJIYLGYqMypRXrliZSW',
        handler: ({ message }) => message.length > max
            ? { passed: false, reason: `${message.length} of ${max} characters` }
            : { passed: true },
    })
}
