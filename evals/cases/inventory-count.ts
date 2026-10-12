import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, numbers, search } from './world'

const inventoryCount: CaseDef = {
    id: 'inventory-count',
    description: 'One search returns everything; the model must add stock and find the cheapest price.',
    userMessage: 'Cuantas unidades de laptops hay en total en el almacen y cual es la laptop mas barata?',
    tools: [SEARCH_TOOL, GET_TOOL],
    world: (tool, args) => tool === 't_search' ? search(args.query, true) : get(args.id),
    check (answer) {
        const text = numbers(answer)
        const ok = /\b19\b/.test(text) && /\b990\b/.test(text)
        return ok ? { ok } : { ok, reason: 'expected 19 units and 990 as cheapest price' }
    },
}

export default inventoryCount
