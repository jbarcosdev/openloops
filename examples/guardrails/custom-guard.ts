import { Guard } from 'openloops/guardrails'

export const noSpam = new Guard({
    name: 'no_spam',
    description: 'Blocks obvious spam phrases',
    type: 'input',
    reply: 'This looks like spam.',
    handler: ({ message }) => /buy now|free money/i.test(message)
        ? { passed: false, reason: 'Spam phrase' }
        : { passed: true },
})
