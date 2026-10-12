import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, search } from './world'

const NOT_FOUND = /\bno (se |he |fue |ha |pude |pudo )*(podido )?(encontr|hall|localiz)|no encuentro|no existe|no hay|no se encuentra|no est[aá] (disponible|en)|no figura|no aparece|inexistente|not.?found|does not exist/i

const missingItem: CaseDef = {
    id: 'missing-item',
    description: 'The item does not exist; the model must say so instead of inventing a price.',
    userMessage: 'Dame el precio del item Z9.',
    tools: [SEARCH_TOOL, GET_TOOL],
    maxTurns: 4,
    world: (tool, args) => tool === 't_search' ? search(args.query, true) : get(args.id),
    check (answer) {
        if (/\d{3,}/.test(answer)) return { ok: false, reason: 'answer contains a made up number' }
        if (NOT_FOUND.test(answer)) return { ok: true }
        return { ok: false, reason: /herramienta|acceso|no puedo (consultar|obtener)|tool/i.test(answer) ? 'answer blames missing tool access instead of saying the item was not found' : 'answer does not say the item was not found' }
    },
}

export default missingItem
