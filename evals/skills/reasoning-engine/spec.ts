import { defineSkillEval } from '../../core/define'
import { defineTool } from '../../cases/world'
import { SCENARIOS } from './scenarios'

export default defineSkillEval({
    skill: 'reasoning-engine',
    kind: 'loop',
    models: ['gpt-6-luna', 'gpt-4o-mini', 'claude-haiku-5-5', 'gemini-2.5-flash'],
    modes: ['text', 'fc-step'],
    runs: 2,
    reasoning: ['off'],
    strict: ['on'],
    scenarios: SCENARIOS,
    defaultCases: ['lookup-chain', 'name-to-id', 'error-recovery', 'ask-user', 'injection'],
    nativeTools: [
        defineTool('ask_user', 'Pause the task and ask the user a question. Use it only when you cannot continue without information that only the user can provide. Their answer comes back as the result of this action.', { question: { type: 'string' } }),
        defineTool('respond', 'Deliver your final answer to the user and end the task. Use it once, when you have what you need or when you cannot do more. Do not combine it with actions whose results you still need.', { answer: { type: 'string' } }),
    ],
    finals: { respond: 'answer', ask_user: 'question' },
    load () {
        require('reflect-metadata')
        return require('@loops/agi/skills/reasoning-engine').reasoningEngine
    },
})
