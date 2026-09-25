import { CurrentUser, CurrentSession } from '@services/app/core'
import { Logger } from '@common/logger'
import { Chat } from '@services/chats/entities/chat.entity'
import { AgentTask } from '@services/chats/entities/agent-task.entity'
import { Tool, BaseParams } from '@services/agent/tools/tool'
import { SkillRunOptions } from '@services/agent/skills/skill'
import { WeightedKeyword, ScoredTool } from '@services/agent/utils/rank-tools-by-keywords'

export interface RunContext {
    task?: AgentTask
    chat: Chat
    currentUser: CurrentUser
    currentSession?: CurrentSession
    currentMessage: string
    answerId: string
    tools: Tool[]
    searchTools: (keywords: WeightedKeyword[], opts?: { page?: number; limit?: number }) => ScoredTool[]
    baseParams: BaseParams
    skillParams: Pick<SkillRunOptions, 'sessionId' | 'answerId' | 'userMessage' | 'currentUser' | 'currentSession' | 'chat'>
    reply: (content: string) => void
    setNextNode: (node?: string | AgentLoopNode) => void
    logger: Logger
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
