import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, numbers, search } from './world'

const dependentChain: CaseDef = {
    id: 'dependent-chain',
    description: 'Search does not return stock; the model must search first and then get the cheapest item.',
    userMessage: 'Cuantas unidades hay de la laptop mas barata?',
    tools: [SEARCH_TOOL, GET_TOOL],
    maxTurns: 4,
    world: (tool, args) => tool === 't_search' ? search(args.query, false) : get(args.id),
    check (answer, trace) {
        const text = numbers(answer)
        const fetched = trace.some(action => action.tool === 't_get' && String(action.arguments?.id).toLowerCase() === 'l2')
        if (!/\b12\b/.test(text)) return { ok: false, reason: 'expected 12 units' }
        return fetched ? { ok: true } : { ok: false, reason: 'answer is right but item L2 was never fetched' }
    },
}

export default dependentChain
