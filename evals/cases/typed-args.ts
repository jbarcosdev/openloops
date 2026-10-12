import type { CaseDef } from '../core/types'
import { defineTool, GET_TOOL, ITEMS, SEARCH_TOOL, get, search } from './world'

const RATES: Record<string, number> = { USD: 1, EUR: 0.9 }

const typedArgs: CaseDef = {
    id: 'typed-args',
    description: 'A tool needs a number and an enum; the model must send the right types and values.',
    userMessage: 'Dame una cotizacion en EUR del item L2 con 10% de descuento.',
    tools: [
        SEARCH_TOOL,
        GET_TOOL,
        defineTool('t_quote', 'Quote one item in a currency with a discount percentage.', { id: { type: 'string' }, discount_percent: { type: 'number' }, currency: { type: 'string', enum: ['USD', 'EUR'] } }),
    ],
    maxTurns: 4,
    world (tool, args) {
        if (tool === 't_search') return search(args.query, true)
        if (tool === 't_get') return get(args.id)
        const item = ITEMS.find(entry => entry.id.toLowerCase() === String(args?.id ?? '').toLowerCase())
        if (!item) return JSON.stringify({ error: 'not_found' })
        if (typeof args.discount_percent !== 'number') return JSON.stringify({ error: 'discount_percent must be a number' })
        if (!RATES[args.currency]) return JSON.stringify({ error: 'currency must be USD or EUR' })
        return JSON.stringify({ id: item.id, currency: args.currency, price: Number((item.price * (1 - args.discount_percent / 100) * RATES[args.currency]).toFixed(2)) })
    },
    check (answer) {
        return /801[.,]90?(?!\d)/.test(answer) ? { ok: true } : { ok: false, reason: 'expected quote 801.9 EUR' }
    },
}

export default typedArgs
