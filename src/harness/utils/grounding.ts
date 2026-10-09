import { AgentTask } from '@services/tasks/entities/agent-task.entity'
import { Workspace } from '../workspace'

const IDENTIFIER_IN_TEXT = /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,64})\b/gi
const USER_ANSWER_PREFIX = 'user_answer_'
const MAX_DEPTH = 8

export const UNGROUNDED_PHRASE = "not found in the user's messages or in any result"

export function collectStrings (value: any, found: string[] = [], depth = 0): string[] {
    if (depth > MAX_DEPTH) return found

    if (typeof value === 'string') found.push(value)
    else if (Array.isArray(value)) value.forEach(item => collectStrings(item, found, depth + 1))
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, found, depth + 1))

    return found
}

export function opaqueIdentifiers (texts: string[]): string[] {
    const found = new Set<string>()

    for (const text of texts) {
        for (const match of text.match(IDENTIFIER_IN_TEXT) ?? []) {
            if (/\d/.test(match)) found.add(match)
        }
    }

    return Array.from(found)
}

async function groundingCorpus (task: AgentTask, workspace: Workspace): Promise<string | undefined> {
    const parts: string[] = [task.opening ?? '']

    for (const [key, value] of Object.entries(task.known ?? {})) {
        if (key.startsWith(USER_ANSWER_PREFIX)) parts.push(String(value))
    }

    for (const action of task.actions) {
        if (action.error?.message && !String(action.error.message).includes(UNGROUNDED_PHRASE)) parts.push(String(action.error.message))
        if (action.output !== undefined) parts.push(JSON.stringify(action.output))

        if (action.outputRef) {
            try {
                const item = await workspace.get(action.outputRef, { taskId: task.id })
                if (item?.content !== undefined) parts.push(typeof item.content === 'string' ? item.content : JSON.stringify(item.content))
            } catch {
                return undefined
            }
        }
    }

    return parts.join('\n').toLowerCase()
}

export async function ungroundedIdentifiers (task: AgentTask, workspace: Workspace, texts: string[]): Promise<string[]> {
    const candidates = opaqueIdentifiers(texts)
    if (!candidates.length) return []

    const corpus = await groundingCorpus(task, workspace)
    if (corpus === undefined) return []

    return candidates.filter(candidate => !corpus.includes(candidate.toLowerCase()))
}
