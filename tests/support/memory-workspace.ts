import type { Workspace, WorkspaceFilters, WorkspaceSaveInput } from '@harness/workspace'

type Item = Record<string, any>

export class MemoryWorkspace implements Workspace {
    readonly items = new Map<string, Item>()

    constructor (seed: Record<string, unknown> = {}) {
        for (const [name, content] of Object.entries(seed)) this.items.set(name, { name, content, kind: 'note' })
    }

    async save (input: WorkspaceSaveInput): Promise<any> {
        const item = { ...input }
        this.items.set(input.name, item)
        return item
    }

    async get (name: string): Promise<any> {
        return this.items.get(name) ?? null
    }

    async list (filters?: WorkspaceFilters): Promise<any[]> {
        return [...this.items.values()]
            .filter(item => !filters?.kind || item.kind === filters.kind)
            .map(({ content, ...rest }) => rest)
    }

    async search (query: string): Promise<any[]> {
        const needle = query.toLowerCase()
        return [...this.items.values()].filter(item => item.name.toLowerCase().includes(needle))
    }

    async remove (name: string): Promise<number> {
        return this.items.delete(name) ? 1 : 0
    }
}

export class UnreadableWorkspace extends MemoryWorkspace {
    async get (): Promise<any> {
        throw new Error('storage is down')
    }
}
