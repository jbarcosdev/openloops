import type { CurrentUser } from '@common/base'

export interface LLMToolCall {
    id: string
    name: string
    arguments: Record<string, any>
}

export interface LLMToolDefinition {
    name: string
    description: string
    parameters: Record<string, any>
}

export type LLMMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: LLMToolCall[]; native?: unknown }
    | { role: 'tool'; toolCallId: string; toolName: string; content: string; isError?: boolean }

export type LLMStopReason = 'stop' | 'length' | 'tool_use' | 'error' | 'aborted'

export interface LLMUsage {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    costInUsd: number
}

export interface LLMResponse {
    text: string
    toolCalls: LLMToolCall[]
    stopReason: LLMStopReason
    usage: LLMUsage
    responseId?: string
    model?: string
    errorMessage?: string
    native?: unknown
}

export type LLMToolChoice = 'auto' | 'none'

export interface LLMChatParams {
    origin: string
    sessionId: string
    answerId: string
    currentUser?: CurrentUser
    messages: LLMMessage[]
    tools?: LLMToolDefinition[]
    toolChoice?: LLMToolChoice
    provider?: string
    modelName?: string
    temperature?: number
}
