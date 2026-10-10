import { Guard } from '../guard'

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

/**
 * Input guard that blocks messages containing an email address.
 * Keeps personal contact data out of the conversation, the stored chat and the model prompt.
 *
 * ```ts
 * import { inputGuards } from 'openloops/guardrails'
 *
 * agent.addGuard(inputGuards.blockEmail)
 * agent.addGuard(inputGuards.blockEmail.withReply('Por favor no compartas correos aquí.'))
 * ```
 */
export const blockEmail = new Guard({
    name: 'block_email',
    description: 'Blocks messages that contain an email address',
    type: 'input',
    reply: 'Please do not share email addresses in this conversation.',
    ref: 'TLl8DQ/HD499/+w1/FK/jxF+GQMifiWJ',
    handler: ({ message }) => EMAIL.test(message) ? { passed: false, reason: 'Email address' } : { passed: true },
})
