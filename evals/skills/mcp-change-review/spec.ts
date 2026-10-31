import { defineOutput, defineSkillEval } from '../../core/define'
import { SCENARIOS } from './scenarios'

export default defineSkillEval({
    skill: 'mcp-change-review',
    kind: 'single',
    models: ['claude-haiku-5-5'],
    modes: ['text'],
    runs: 3,
    reasoning: ['low', 'medium', 'high'],
    outputSchema: defineOutput({
        reasoning: { type: 'string' },
        decision: { type: 'string', enum: ['APPROVE', 'ASK'] },
        question: { type: 'string' },
    }),
    scenarios: SCENARIOS,
    load () {
        require('reflect-metadata')
        return require('@harness/skills').mcpChangeReview
    },
})
