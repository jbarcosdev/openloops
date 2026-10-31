import { defineOutput, defineSkillEval } from '../../core/define'
import { SCENARIOS } from './scenarios'

export default defineSkillEval({
    skill: 'fast-responder',
    kind: 'single',
    models: ['claude-haiku-5-5'],
    modes: ['text'],
    runs: 3,
    reasoning: ['off', 'low'],
    outputSchema: defineOutput({
        can_answer: { type: 'boolean' },
        answer: { type: 'string' },
        reasoning: { type: 'string' },
        detected_language: { type: 'string' },
        activity: { type: 'string' },
    }, ['can_answer', 'answer', 'reasoning', 'detected_language']),
    scenarios: SCENARIOS,
    load () {
        require('reflect-metadata')
        return require('@loops/shared/skills').fastResponder
    },
})
