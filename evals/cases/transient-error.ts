import type { CaseDef } from '../core/types'
import { GET_TOOL, SEARCH_TOOL, get, numbers, search } from './world'

const transientError: CaseDef = {
    id: 'transient-error',
    description: 'The first t_get fails with a temporary error; the model must retry or use another route, never give up or invent data.',
    userMessage: 'Cual es el precio del item L2?',
    tools: [SEARCH_TOOL, GET_TOOL],
    maxTurns: 5,
    world (tool, args, ctx) {
        if (tool === 't_search') return search(args.query, true)
        return ctx.calls.filter(action => action.tool === 't_get').length === 1 ? JSON.stringify({ error: 'temporarily_unavailable', message: 'The inventory service is busy, try again' }) : get(args.id)
    },
    check (answer) {
        return /\b990\b/.test(numbers(answer)) ? { ok: true } : { ok: false, reason: 'expected price 990' }
    },
}

export default transientError
