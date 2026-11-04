import { Guard } from 'openloops/guardrails'

/**
 * An input guard of your own. The handler receives the message before the loop runs and returns `{ passed: true }` or `{ passed: false, reason }`. When it blocks, the user gets `reply` and the model never sees the message.
 *
 * Add it with `guards: [noSpam]` in the `Agent` or with `agent.addGuard(noSpam)`.
 */
export const noSpam = new Guard({
    name: 'no_spam',
    description: 'Blocks obvious spam phrases',
    type: 'input',
    reply: 'This looks like spam.',
    handler: ({ message }) => /buy now|free money/i.test(message)
        ? { passed: false, reason: 'Spam phrase' }
        : { passed: true },
})
