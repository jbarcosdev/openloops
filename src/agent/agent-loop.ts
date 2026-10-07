import { CurrentUser, CurrentSession } from '@common/base'
import { Logger } from '@common/logger'
import { Chat } from '@services/chats/entities/chat.entity'
import { ChatSettingsProps } from '@services/chats/entities/chat-settings.entity'
import { AgentTask } from '@services/tasks/entities/agent-task.entity'
import { AgentAction } from '@services/tasks/entities/agent-action.entity'
import { Tool, BaseParams } from '@tools/tool'
import { SkillRunOptions } from '@skills/skill'
import { WeightedKeyword, ScoredTool } from './utils/rank-tools-by-keywords'
import { Workspace } from './workspace'
import { ToolPipelineRunOptions } from './tool-pipeline'

export interface RunContext {
    identity?: AgentIdentity
    task?: AgentTask
    chat: Chat
    chatOptions?: ChatSettingsProps
    currentUser: CurrentUser
    currentSession?: CurrentSession
    currentMessage: string
    answerId: string
    tools: Tool[]
    ensureTools: () => Promise<Tool[]>
    searchTools: (keywords: WeightedKeyword[], opts?: { page?: number; limit?: number }) => ScoredTool[]
    workspace: Workspace
    runAction: (action: AgentAction, opts?: ToolPipelineRunOptions) => Promise<AgentAction>
    requiresApproval: (action: AgentAction) => boolean
    reopenTask: (taskId: string) => Promise<AgentTask | undefined>
    baseParams: BaseParams
    skillParams: Pick<SkillRunOptions, 'provider' | 'modelName' | 'sessionId' | 'answerId' | 'userMessage' | 'currentUser' | 'currentSession' | 'chat'>
    reply: (content: string) => void
    setNextNode: (node?: string | AgentLoopNode) => void
    logger: Logger
}

interface AgentIdentity {
    name?: string
    gender?: string
    role?: string
}

export type AgentLoopNode = (ctx: RunContext) => Promise<void>

export interface Author {
    name: string
    email: string
    website?: string
}

export abstract class AgentLoop {
    abstract get initialNode (): string | AgentLoopNode

    abstract get nodes (): Record<string, AgentLoopNode>

    abstract get name (): string

    abstract get version (): string

    abstract get author (): Author
}
