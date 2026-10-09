import { Guard } from '../guard'

const FENCED = /(^|\n)[ \t]*(```|~~~)/

/**
 * Input guard that blocks messages containing fenced code blocks (``` or ~~~).
 * Useful for agents that should talk in plain language, like support or sales assistants,
 * where pasted code is noise or an attempt to inject instructions.
 * Inline snippets, error messages and ordinary prose pass.
 *
 * ```ts
 * import { inputGuards } from 'openloops/guardrails'
 *
 * agent.addGuard(inputGuards.blockCode)
 * agent.addGuard(inputGuards.blockCode.withReply('Please describe the problem in plain text.'))
 * ```
 */
export const blockCode = new Guard({
    name: 'block_code',
    description: 'Blocks messages that contain fenced code blocks',
    type: 'input',
    reply: 'Code is not accepted in this conversation.',
    ref: 'ouTmb3kZYMx/msnBnOXW5ckBts/vQNJz',
    handler: ({ message }) => FENCED.test(message) ? { passed: false, reason: 'Fenced code block' } : { passed: true },
})
