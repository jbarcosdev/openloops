import { McpServerRepository } from './repositories'

export interface StoredInternalMcp {
    name: string
    url: string
    headers?: Record<string, string>
}

export async function listActiveInternalMcps (): Promise<StoredInternalMcp[]> {
    const items = await new McpServerRepository().findActiveInternals()

    return items.flatMap(item => item.name && item.url ? [{ name: item.name, url: item.url, ...(item.headers ? { headers: item.headers } : {}) }] : [])
}
