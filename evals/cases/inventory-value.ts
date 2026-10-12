import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, numbers, search } from './world'

const inventoryValue: CaseDef = {
    id: 'inventory-value',
    description: 'Search returns no stock; the model must fetch each monitor, then add units and compute stock times price.',
    userMessage: 'Cuantas unidades de monitores hay en total y cual es el valor total del inventario de monitores (precio por unidades de cada uno, sumado)?',
    tools: [SEARCH_TOOL, GET_TOOL],
    maxTurns: 6,
    world: (tool, args) => tool === 't_search' ? search(args.query, false) : get(args.id),
    check (answer, trace) {
        const text = numbers(answer)
        const fetched = ['m1', 'm2'].every(id => trace.some(action => action.tool === 't_get' && String(action.arguments?.id).toLowerCase() === id))
        if (!/\b13\b/.test(text) || !/\b3170\b/.test(text)) return { ok: false, reason: 'expected 13 units and 3170 total value' }
        return fetched ? { ok: true } : { ok: false, reason: 'right numbers but M1 and M2 were not both fetched' }
    },
}

export default inventoryValue
