import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, numbers, search } from './world'

const multiLookup: CaseDef = {
    id: 'multi-lookup',
    description: 'Three independent lookups that can run in parallel, then an addition.',
    userMessage: 'Cuanto cuesta en total comprar una unidad de cada item: L2, M1 y K1?',
    tools: [SEARCH_TOOL, GET_TOOL],
    maxTurns: 5,
    world: (tool, args) => tool === 't_search' ? search(args.query, true) : get(args.id),
    check (answer) {
        return /\b1390\b/.test(numbers(answer)) ? { ok: true } : { ok: false, reason: 'expected total 1390' }
    },
}

export default multiLookup
