import { answerJson } from '../../core/define'
import { activityVerdict } from '../../cases/activity'
import type { CaseDef } from '../../core/types'

const LANGUAGES = ['en', 'es', 'pt', 'fr']

const CATEGORIES: Array<{ id: string, canAnswer: boolean, description: string, messages: Record<string, string> }> = [
    {
        id: 'data-query',
        canAnswer: false,
        description: 'A question about the data of the user cannot be answered without tools.',
        messages: { en: 'How much did I spend on food last month?', es: 'Cuanto gaste en comida el mes pasado?', pt: 'Quanto gastei com comida no mes passado?', fr: "Combien ai-je depense en nourriture le mois dernier ?" },
    },
    {
        id: 'register',
        canAnswer: false,
        description: 'Registering something needs tools.',
        messages: { en: 'Log a $20 purchase today at Walmart', es: 'Registra una compra de $20 hoy en Walmart', pt: 'Registre uma compra de $20 hoje no Walmart', fr: "Enregistre un achat de 20 $ aujourd'hui chez Walmart" },
    },
    {
        id: 'memory',
        canAnswer: false,
        description: 'Memory that is not in the context must not be faked.',
        messages: { en: 'Do you remember the meeting we talked about last week?', es: 'Recuerdas la reunion de la que hablamos la semana pasada?', pt: 'Voce lembra da reuniao de que falamos na semana passada?', fr: "Tu te souviens de la reunion dont on a parle la semaine derniere ?" },
    },
    {
        id: 'live-info',
        canAnswer: false,
        description: 'Live information needs internet access.',
        messages: { en: 'What is the weather in Madrid right now?', es: 'Que tiempo hace ahora mismo en Madrid?', pt: 'Como esta o tempo em Madrid agora?', fr: 'Quel temps fait-il a Madrid en ce moment ?' },
    },
    {
        id: 'correction',
        canAnswer: false,
        description: 'A correction of a previous result goes to the engine.',
        messages: { en: 'No, that was not the right date, look for another one', es: 'No, esa no era la fecha, busca otra', pt: 'Nao, essa nao era a data, procure outra', fr: "Non, ce n'etait pas la bonne date, cherche-en une autre" },
    },
    {
        id: 'greeting',
        canAnswer: true,
        description: 'A greeting is answered directly.',
        messages: { en: 'Hi! How are you today?', es: 'Hola! Como estas hoy?', pt: 'Oi! Como voce esta hoje?', fr: "Salut ! Comment vas-tu aujourd'hui ?" },
    },
    {
        id: 'knowledge',
        canAnswer: true,
        description: 'General knowledge is answered directly.',
        messages: { en: 'What is the capital of Australia?', es: 'Cual es la capital de Australia?', pt: 'Qual e a capital da Australia?', fr: "Quelle est la capitale de l'Australie ?" },
    },
]

const scenario = (category: typeof CATEGORIES[number], language: string): CaseDef => ({
    id: `${category.id}-${language}`,
    description: `${category.description} (${language})`,
    userMessage: category.messages[language],
    tools: [],
    maxTurns: 1,
    world: () => '',
    check (answer) {
        const result = answerJson(answer)
        if (!result) return { ok: false, reason: 'answer is not a JSON object' }
        if (result.can_answer !== category.canAnswer) return { ok: false, reason: `can_answer is ${result.can_answer}, expected ${category.canAnswer}` }
        if (String(result.detected_language).toLowerCase() !== language) return { ok: false, reason: `detected_language is ${result.detected_language}, expected ${language}` }
        if (category.canAnswer) return String(result.answer ?? '').trim() ? { ok: true } : { ok: false, reason: 'can_answer is true but the answer is empty' }
        if (String(result.answer ?? '').length > 80) return { ok: false, reason: 'answer should be empty or minimal when can_answer is false' }
        return activityVerdict(language, [String(result.activity ?? '').trim()].filter(Boolean))
    },
})

export const SCENARIOS: CaseDef[] = CATEGORIES.flatMap(category => LANGUAGES.map(language => scenario(category, language)))
