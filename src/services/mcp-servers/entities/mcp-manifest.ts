import { createHash } from 'node:crypto'

export type McpTrust = 'locked' | 'approved' | 'pending' | 'blocked'
export type McpStatus = 'ok' | 'error' | 'unknown'
export type McpChangeType = 'tool_added' | 'tool_removed' | 'tool_changed' | 'instructions_changed' | 'server_changed'

export interface McpToolSnapshot {
    name: string
    description?: string
    inputSchema?: unknown
    annotations?: unknown
    hash: string
}

export interface McpManifest {
    serverName?: string
    serverVersion?: string
    instructions?: string
    tools: McpToolSnapshot[]
    hash: string
    fetchedAt: Date
}

export interface McpChange {
    type: McpChangeType
    tool?: string
    fields?: string[]
}

export type McpEventType = 'manifest_changed' | 'endpoint_changed' | 'approved' | 'blocked'
export type McpSource = 'web' | 'chat' | 'system'

export interface McpHistoryEntry {
    type: McpEventType
    at: Date
    source: McpSource
    fromHash?: string
    toHash?: string
    changes?: McpChange[]
    fromHost?: string
    toHost?: string
}

export interface RawMcpManifest {
    serverName?: string
    serverVersion?: string
    instructions?: string
    tools: Array<{ name: string, description?: string, inputSchema?: unknown, annotations?: unknown }>
}

const TOOL_FIELDS = ['description', 'inputSchema', 'annotations'] as const

const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
        const source = value as Record<string, unknown>
        return Object.fromEntries(Object.keys(source).sort().map(key => [key, canonical(source[key])]))
    }
    return value
}

export const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value)) ?? '').digest('hex')

export const buildManifest = (raw: RawMcpManifest, fetchedAt: Date = new Date()): McpManifest => {
    const tools = raw.tools
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            hash: sha256({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    const hash = sha256({ serverName: raw.serverName, instructions: raw.instructions, tools: tools.map(tool => [tool.name, tool.hash]) })
    return { serverName: raw.serverName, serverVersion: raw.serverVersion, instructions: raw.instructions, tools, hash, fetchedAt }
}

export const diffManifests = (from: McpManifest | null | undefined, to: McpManifest): McpChange[] => {
    const changes: McpChange[] = []
    const before = new Map((from?.tools ?? []).map(tool => [tool.name, tool]))
    const after = new Map(to.tools.map(tool => [tool.name, tool]))
    if (from && from.serverName !== to.serverName) changes.push({ type: 'server_changed' })
    if (from && sha256(from.instructions) !== sha256(to.instructions)) changes.push({ type: 'instructions_changed' })
    for (const [name, tool] of after) {
        const previous = before.get(name)
        if (!previous) {
            changes.push({ type: 'tool_added', tool: name })
            continue
        }
        if (previous.hash === tool.hash) continue
        const fields = TOOL_FIELDS.filter(field => sha256(previous[field]) !== sha256(tool[field]))
        changes.push({ type: 'tool_changed', tool: name, fields })
    }
    for (const name of before.keys()) if (!after.has(name)) changes.push({ type: 'tool_removed', tool: name })
    return changes
}
