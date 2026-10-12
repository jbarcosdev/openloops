import { defineModelEval } from '../core/define'

export default defineModelEval({
    provider: 'openai',
    model: 'model-id',
    snapshots: ['model-id'],
    reasoning: ['off'],
    modes: ['tools-off', 'text', 'fc-split', 'fc-step'],
    strict: ['on'],
    cases: ['inventory-count', 'dependent-chain', 'multi-lookup', 'missing-item', 'no-tool', 'inventory-value', 'transient-error', 'tool-selection', 'injection', 'typed-args'],
    runs: 3,
    notes: 'free text saved in the result file',
})
