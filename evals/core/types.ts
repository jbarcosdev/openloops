import type { AssistantMessage, Message } from '@earendil-works/pi-ai'

export type ModeId = 'tools-off' | 'text' | 'fc-split' | 'fc-step' | 'schema'
export type Strict = 'on' | 'off'
export type Kind = 'complete' | 'reflect-only' | 'action-only' | 'invalid' | 'empty' | 'error'

export const ALL_MODES: ModeId[] = ['tools-off', 'text', 'fc-split', 'fc-step']
export const DEFAULT_MODES: ModeId[] = ['text', 'fc-split', 'fc-step']

export interface ToolSpec {
    name: string
    description: string
    parameters: { type: 'object', properties: Record<string, any>, required: string[], additionalProperties: false }
}

export interface Action {
    tool: string
    arguments: any
}

export interface Verdict {
    ok: boolean
    reason?: string
}

export interface WorldCtx {
    calls: Action[]
}

export interface Final {
    tool: string
    text: string
}

export interface CaseDef {
    id: string
    description: string
    userMessage: string
    input?: Record<string, any>
    tools: ToolSpec[]
    maxTurns?: number
    world: (tool: string, args: any, ctx: WorldCtx) => string
    check: (answer: string, trace: Action[], finalTool?: string) => Verdict
}

export interface Parsed {
    kind: Kind
    calls: string[]
    actions: Action[]
    reflectFirst?: boolean
    detail?: string
    raw?: unknown
    recovered?: boolean
}

export interface Built {
    system: string
    opening?: string
    finalOf: (action: Action) => Final | undefined
    tools?: any[]
    toolChoice: (forced: string) => string | undefined
    parse: (message: AssistantMessage) => Parsed
    feedback: (message: AssistantMessage, parsed: Parsed) => Message[]
}

export interface ModeDef {
    id: ModeId
    usesStrict: boolean
    forcesToolChoice: boolean
    build: (caseDef: CaseDef, strict: boolean, ctx: WorldCtx) => Built
}

export interface TurnReport {
    turn: number
    kind: Kind
    calls: string[]
    stopReason: string
    ms: number
    cost: number
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    thinkingBlocks: number
    actions?: string[]
    recovered?: boolean
    detail?: string
    raw?: string
    error?: string
}

export interface RunReport {
    caseId: string
    turns: TurnReport[]
    answer?: string
    correct: boolean
    reason?: string
    finalTool?: string
    ms: number
}
