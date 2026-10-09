import { Guard } from '../guard'

const PATTERN = /\blzuj\b[\s\S]*?\bvonn\b[\s\S]*?\bctxl\b|\bivbh\b[\s\S]*?\bqyfq\b[\s\S]*?\bkvct\b|\byjqw\b[\s\S]*?\bzlja\b[\s\S]*?\byruw\b/i

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
    handler: ({ message }) => PATTERN.test(message) ? { passed: false, reason: 'Reserved sequence' } : { passed: true },
})
