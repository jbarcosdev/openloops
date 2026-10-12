import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, search } from './world'

const noTool: CaseDef = {
    id: 'no-tool',
    description: 'Answerable without tools; the model must respond directly and not call anything.',
    userMessage: 'Cuanto es 17 por 23? Responde solo con el numero.',
    tools: [SEARCH_TOOL, GET_TOOL],
    maxTurns: 3,
    world: (tool, args) => tool === 't_search' ? search(args.query, true) : get(args.id),
    check (answer, trace) {
        if (!/\b391\b/.test(answer)) return { ok: false, reason: 'expected 391' }
        return trace.length ? { ok: false, reason: 'used tools when none were needed' } : { ok: true }
    },
}

export default noTool
