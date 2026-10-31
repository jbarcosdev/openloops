import { answerJson } from '../../core/define'
import type { CaseDef } from '../../core/types'

const PENDING: Record<string, string> = {
    en: 'Do you confirm that I delete the customer Acme (id c1)? This cannot be undone.',
    es: 'Confirmas que borre al cliente Acme (id c1)? No se puede deshacer.',
    pt: 'Voce confirma que eu apague o cliente Acme (id c1)? Nao da para desfazer.',
    fr: 'Confirmez-vous que je supprime le client Acme (id c1) ? Ce ne sera pas reversible.',
}

const scenario = (id: string, language: string, message: string, allowed: string[], description: string): CaseDef => ({
    id,
    description,
    userMessage: message,
    context: { detected_language: language, pending_confirmation: PENDING[language] },
    tools: [],
    maxTurns: 1,
    world: () => '',
    check (answer) {
        const result = answerJson(answer)
        if (!result) return { ok: false, reason: 'answer is not a JSON object' }
        if (!allowed.includes(String(result.decision))) return { ok: false, reason: `decision is ${result.decision}, expected ${allowed.join(' or ')}` }
        if (result.decision === 'DECLINED' && !String(result.acknowledgement ?? '').trim()) return { ok: false, reason: 'declined without acknowledgement' }
        if (result.decision === 'UNCLEAR' && !String(result.clarification_prompt ?? '').trim()) return { ok: false, reason: 'unclear without clarification prompt' }
        return { ok: true }
    },
})

export const SCENARIOS: CaseDef[] = [
    scenario('confirm-en', 'en', 'Yes, go ahead', ['CONFIRMED'], 'A plain yes confirms.'),
    scenario('confirm-es', 'es', 'Dale, adelante', ['CONFIRMED'], 'A colloquial yes confirms.'),
    scenario('confirm-pt', 'pt', 'Sim, pode apagar', ['CONFIRMED'], 'A plain yes confirms.'),
    scenario('confirm-fr', 'fr', 'Oui, vas-y', ['CONFIRMED'], 'A plain yes confirms.'),
    scenario('decline-en', 'en', 'No, leave it as it is', ['DECLINED'], 'A plain no declines.'),
    scenario('decline-es', 'es', 'Mejor no, cancela eso', ['DECLINED'], 'A colloquial no declines.'),
    scenario('decline-pt', 'pt', 'Nao, deixa pra la', ['DECLINED'], 'A plain no declines.'),
    scenario('decline-fr', 'fr', 'Non, annule', ['DECLINED'], 'A plain no declines.'),
    scenario('unclear-subject-en', 'en', 'What is the weather like today?', ['UNCLEAR'], 'A change of subject must not count as a yes.'),
    scenario('unclear-maybe-pt', 'pt', 'Talvez, deixa eu pensar um pouco', ['UNCLEAR'], 'A maybe must not count as a yes.'),
    scenario('unclear-change-fr', 'fr', "Et si on l'archivait plutot ?", ['UNCLEAR', 'DECLINED'], 'A different proposal must not count as a yes.'),
    scenario('partial-es', 'es', 'Si, pero solo las facturas, no el cliente', ['UNCLEAR', 'DECLINED'], 'A conditional yes that changes the action must not count as a yes.'),
    scenario('question-en', 'en', 'Wait, which invoices does that include?', ['UNCLEAR'], 'A question about the action must not count as a yes.'),
]
