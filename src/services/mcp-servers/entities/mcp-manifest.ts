import { createHash } from 'node:crypto'

export type McpTrust = 'locked' | 'approved' | 'blocked'
export type McpStatus = 'ok' | 'error' | 'unknown'

export interface McpToolSnapshot {
    name: string
    description?: string
    inputSchema?: any
    annotations?: unknown
}

export interface McpManifest {
    instructions?: string
    tools: McpToolSnapshot[]
    hash: string
    fetchedAt: Date
}

export interface McpToolChange {
    name: string
    change: 'added' | 'removed' | 'modified'
    description?: { from?: string, to?: string }
    parameters?: { added: string[], removed: string[] }
    annotations?: { from?: unknown, to?: unknown }
}

export interface McpManifestDiff {
    tools: McpToolChange[]
    instructions?: { from?: string, to?: string }
}

const MAX_TEXT_CHARS = 300
const MAX_DIFF_TOOLS = 50
const MAX_PARAMETERS = 30

const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
        const source = value as Record<string, unknown>
        return Object.fromEntries(Object.keys(source).sort().map(key => [key, canonical(source[key])]))
    }
    return value
}

const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value)) ?? '').digest('hex')

const same = (a: unknown, b: unknown): boolean => sha256(a) === sha256(b)

const cut = (text?: string): string | undefined => text?.slice(0, MAX_TEXT_CHARS)

const parameterNames = (tool?: McpToolSnapshot): string[] => Object.keys(tool?.inputSchema?.properties ?? {})

export const buildManifest = (raw: { instructions?: string, tools: McpToolSnapshot[] }, fetchedAt: Date = new Date()): McpManifest => {
    const tools = raw.tools
        .map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }))
        .sort((a, b) => a.name.localeCompare(b.name))
    return { instructions: raw.instructions, tools, hash: sha256({ instructions: raw.instructions, tools }), fetchedAt }
}

export const diffManifests = (from: McpManifest | undefined, to: McpManifest): McpManifestDiff => {
    const before = new Map((from?.tools ?? []).map(tool => [tool.name, tool]))
    const after = new Map(to.tools.map(tool => [tool.name, tool]))
    const tools: McpToolChange[] = []

    for (const [name, tool] of after) {
        const previous = before.get(name)
        if (!previous) {
            tools.push({ name, change: 'added', description: { to: cut(tool.description) }, parameters: { added: parameterNames(tool).slice(0, MAX_PARAMETERS), removed: [] } })
            continue
        }
        const change: McpToolChange = { name, change: 'modified' }
        if (!same(previous.description, tool.description)) change.description = { from: cut(previous.description), to: cut(tool.description) }
        if (!same(previous.inputSchema, tool.inputSchema)) {
            const was = parameterNames(previous)
            const now = parameterNames(tool)
            change.parameters = { added: now.filter(key => !was.includes(key)).slice(0, MAX_PARAMETERS), removed: was.filter(key => !now.includes(key)).slice(0, MAX_PARAMETERS) }
        }
        if (!same(previous.annotations, tool.annotations)) change.annotations = { from: previous.annotations, to: tool.annotations }
        if (change.description || change.parameters || change.annotations) tools.push(change)
    }

    for (const name of before.keys()) if (!after.has(name)) tools.push({ name, change: 'removed' })

    const diff: McpManifestDiff = { tools: tools.slice(0, MAX_DIFF_TOOLS) }
    if (from && !same(from.instructions, to.instructions)) diff.instructions = { from: cut(from.instructions), to: cut(to.instructions) }
    return diff
}

export const needsUserReview = (diff: McpManifestDiff): boolean =>
    !!diff.instructions || diff.tools.some(tool => tool.change === 'added' || !!tool.parameters || !!tool.annotations)
