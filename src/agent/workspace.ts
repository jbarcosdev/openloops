import { CurrentUser } from '@common/base'
import {
    saveWorkspaceItem,
    getWorkspaceItem,
    listWorkspaceItems,
    searchWorkspaceItems,
    deleteWorkspaceItem,
    WorkspaceItemProps,
    WorkspaceItemKind,
} from '@services/workspaces'

export interface WorkspaceSaveInput {
    name: string
    content: any
    kind?: WorkspaceItemKind
    description?: string
    taskId?: string
    source?: string
    truncated?: boolean
}

export interface WorkspaceFilters {
    taskId?: string
    kind?: WorkspaceItemKind
    limit?: number
}

export interface Workspace {
    save: (input: WorkspaceSaveInput) => Promise<WorkspaceItemProps>
    get: (name: string, opts?: { taskId?: string; includeContent?: boolean }) => Promise<WorkspaceItemProps | null>
    list: (filters?: WorkspaceFilters) => Promise<WorkspaceItemProps[]>
    search: (query: string, filters?: WorkspaceFilters) => Promise<WorkspaceItemProps[]>
    remove: (name: string, opts?: { taskId?: string }) => Promise<number>
}

export class AgentWorkspace implements Workspace {
    constructor (
        private readonly chatId: string,
        private readonly currentUser: CurrentUser,
    ) {}

    async save (input: WorkspaceSaveInput): Promise<WorkspaceItemProps> {
        const { data } = await saveWorkspaceItem({
            payload: {
                chatId: this.chatId,
                taskId: input.taskId,
                kind: input.kind ?? 'note',
                name: input.name,
                description: input.description,
                content: input.content,
                source: input.source,
                truncated: input.truncated,
            },
            currentUser: this.currentUser,
        })

        return data
    }

    async get (name: string, opts?: { taskId?: string; includeContent?: boolean }): Promise<WorkspaceItemProps | null> {
        const { data } = await getWorkspaceItem({
            chatId: this.chatId,
            name,
            taskId: opts?.taskId,
            includeContent: opts?.includeContent,
            currentUser: this.currentUser,
        })

        return data
    }

    async list (filters?: WorkspaceFilters): Promise<WorkspaceItemProps[]> {
        const { data } = await listWorkspaceItems({
            chatId: this.chatId,
            taskId: filters?.taskId,
            kind: filters?.kind,
            options: filters?.limit ? { limit: filters.limit } : undefined,
            currentUser: this.currentUser,
        })

        return data
    }

    async search (query: string, filters?: WorkspaceFilters): Promise<WorkspaceItemProps[]> {
        const { data } = await searchWorkspaceItems({
            chatId: this.chatId,
            query,
            taskId: filters?.taskId,
            kind: filters?.kind,
            options: filters?.limit ? { limit: filters.limit } : undefined,
            currentUser: this.currentUser,
        })

        return data
    }

    async remove (name: string, opts?: { taskId?: string }): Promise<number> {
        const { data } = await deleteWorkspaceItem({
            chatId: this.chatId,
            name,
            taskId: opts?.taskId,
            currentUser: this.currentUser,
        })

        return data.deletedCount
    }
}
