import { defineOutput, defineSkillEval } from '../../core/define'
import { SCENARIOS } from './scenarios'

export default defineSkillEval({
    skill: 'confirmation-gate',
    kind: 'single',
    models: ['claude-haiku-5-5'],
    modes: ['text'],
    runs: 3,
    reasoning: ['low', 'medium', 'high'],
    outputSchema: defineOutput({
        decision: { type: 'string', enum: ['CONFIRMED', 'DECLINED', 'UNCLEAR'] },
        reasoning: { type: 'string' },
        acknowledgement: { type: 'string' },
        clarification_prompt: { type: 'string' },
    }, ['decision', 'reasoning']),
    scenarios: SCENARIOS,
    load () {
        require('reflect-metadata')
        return require('@harness/skills').confirmationGate
    },
})
