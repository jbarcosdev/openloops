import { answerJson } from '../../core/define'
import type { CaseDef } from '../../core/types'

const scenario = (id: string, description: string, input: Record<string, any>, mustMention: RegExp[], language = 'en'): CaseDef => ({
    id,
    description,
    userMessage: '',
    input,
    context: { detected_language: language },
    tools: [],
    maxTurns: 1,
    world: () => '',
    check (answer) {
        const result = answerJson(answer)
        if (!result) return { ok: false, reason: 'answer is not a JSON object' }
        const question = String(result.question ?? '')
        if (!question.trim()) return { ok: false, reason: 'empty question' }
        const missing = mustMention.find(pattern => !pattern.test(question))
        if (missing) return { ok: false, reason: `the question does not mention ${missing}: ${question.slice(0, 120)}` }
        return /_|\{|\}|crm__|step_/.test(question) ? { ok: false, reason: 'the question shows internal names' } : { ok: true }
    },
})

export const SCENARIOS: CaseDef[] = [
    scenario('two-actions', 'Both actions and their key values are stated.', { goal: 'Clean the account of Acme', pending_actions: [{ tool: 'crm__delete_customer', arguments: { id: 'c1', name: 'Acme' } }, { tool: 'crm__delete_invoice', arguments: { id: 'inv-14', number: '14' } }] }, [/acme/i, /14/]),
    scenario('create-amount', 'The amount and the place are stated.', { goal: 'Register a purchase', pending_actions: [{ tool: 'create_transaction', arguments: { amount: 50, merchant: 'Walmart', date: '2026-10-30' } }] }, [/50/, /walmart/i]),
    scenario('spanish', 'The question is written in Spanish.', { goal: 'Borrar al cliente', pending_actions: [{ tool: 'crm__delete_customer', arguments: { id: 'c1', name: 'Acme' } }] }, [/acme/i, /\b(borr|elimin)/i], 'es'),
]
