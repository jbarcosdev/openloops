import { container } from 'tsyringe'
import { extractJSON } from '@common/helpers'
import { LLMClient } from '@clients/llm/llm-client'
import { LLMMessage, LLMToolDefinition, ThinkingEffort } from '@clients/llm/llm-types'
import { CurrentUser, CurrentSession } from '@common/base'
import { Logger } from '@common/logger'
import type { Chat } from '@services/chats/entities/chat.entity'
import { buildRuntimeContext } from './runtime-context'
import { SkillMode, DEFAULT_SKILL_MODE, buildModeCall, readModeResponse } from './call-modes'

export { SkillMode, DEFAULT_SKILL_MODE } from './call-modes'

const RAW_RESPONSE_CHARS = 300
const RESERVED_CONTEXT_KEYS = ['tools', 'mode', 'history', 'chatHistory']

export interface SkillProps {
    name: string
    version?: string
    description?: string
    temperature?: number
    /** How much the model thinks before it answers: `off`, `low`, `medium` or `high`. When it is left out, the provider default applies, which is high for the Claude models. */
    thinking?: ThinkingEffort
    systemInstructions: Record<string, any>
    systemRole?: boolean
    /** Default mode of this skill. Defaults to `plain_chat`. See {@link SkillMode} before changing it. */
    mode?: SkillMode
}

export interface ChatTurn {
    role: 'user' | 'assistant'
    content: string
}

export interface SkillRunOptions<TInput = Record<string, any>> {
    provider?: string
    modelName?: string
    sessionId: string
    answerId: string
    userMessage?: string // cuando es una skill tipo extracción o planner no tiene userMessage
    currentUser?: CurrentUser
    currentSession?: CurrentSession
    contextInjection?: Record<string, any>
    input?: TInput
    chat?: Chat
    history?: LLMMessage[]
    chatHistory?: ChatTurn[]
    tools?: LLMToolDefinition[]
    /**
     * How the model is called when `tools` is given. Defaults to the mode of the skill, which defaults to `plain_chat`.
     * Do not set `legacy_tools_off` unless you know exactly what you are doing: it scored 0 to 30% in the evals. See {@link SkillMode}.
     */
    mode?: SkillMode
}

export interface SkillCallInfo {
    skill: string
    skillVersion?: string
    mode: SkillMode
    model?: string
    provider?: string
    blocks: number
    rawText?: string
}

export class Skill<TResponse = Record<string, any>> {
    readonly name: string
    readonly version?: string
    readonly description?: string
    readonly temperature?: number
    readonly thinking?: ThinkingEffort
    readonly systemInstructions: Record<string, any>
    readonly systemRole: boolean
    readonly mode: SkillMode

    constructor (props: SkillProps) {
        this.name = props.name
        this.version = props.version
        this.description = props.description
        this.temperature = props.temperature
        this.thinking = props.thinking
        this.systemInstructions = props.systemInstructions
        this.systemRole = props.systemRole ?? true
        this.mode = props.mode ?? DEFAULT_SKILL_MODE
    }

    async run (options: SkillRunOptions): Promise<TResponse & { responseId: string, costInUsd: number, opening?: string, callInfo: SkillCallInfo }> {
        const { provider, modelName, sessionId, answerId, userMessage, currentUser, currentSession, contextInjection = {}, input = {}, chat, history = [], chatHistory = [], tools, mode = this.mode } = options

        const misplaced = RESERVED_CONTEXT_KEYS.filter(key => key in contextInjection)
        if (misplaced.length) throw new Error(`[SKILL:${this.name}] ${misplaced.join(', ')} must be passed as run options, not inside contextInjection`)
        if (history.length && chatHistory.length) throw new Error(`[SKILL:${this.name}] history and chatHistory cannot be used together`)

        try {
            const llmClient = container.resolve(LLMClient)

            const context = {
                ...buildRuntimeContext({ currentUser, currentSession, chat }),
                ...contextInjection,
            }

            const inputPayload = {
                ...(userMessage ? { user_message: userMessage } : {}),
                ...input,
            }

            const continuing = history.length > 0

            const opening = continuing ? undefined : JSON.stringify(this.systemRole
                ? { CONTEXT: context, INPUT: inputPayload }
                : { SYSTEM_INSTRUCTIONS: { ...this.systemInstructions }, CONTEXT: context, INPUT: inputPayload })

            const conversation: LLMMessage[] = continuing
                ? history
                : [...chatHistory.map(turn => ({ role: turn.role, content: turn.content }) as LLMMessage), { role: 'user', content: opening! }]

            const call = buildModeCall({ mode, skill: this.name, systemInstructions: this.systemInstructions, systemRole: this.systemRole, conversation, tools })

            const response = await llmClient.chat({
                provider,
                modelName,
                sessionId,
                answerId,
                origin: this.name,
                currentUser,
                messages: call.messages,
                tools: call.tools,
                toolChoice: call.toolChoice,
                temperature: this.temperature ?? 0.7,
                ...(this.thinking ? { thinking: this.thinking } : {}),
            })

            const reading = readModeResponse(mode, this.name, response, { expectActions: Boolean(tools?.length) })

            if (reading.blocks > 1) {
                const note = `The model sent ${reading.blocks} text blocks; block ${reading.chosen + 1} was used and the rest were discarded`
                new Logger().warn({ skill: this.name, model: response.model, blocks: reading.blocks, chosen: reading.chosen }, `[SKILL:${this.name}] ${note}`)
                chat?.addTrace({ node: this.name, reasoning: note })
            }

            const parsed = this.parseJsonResponse<TResponse>(reading.text)
            const rawText = Object.keys(parsed as object).length === 0 && reading.text.trim() ? reading.text.trim().slice(0, RAW_RESPONSE_CHARS) : undefined

            const result = {
                ...parsed,
                responseId: response.responseId ?? '',
                costInUsd: response.usage.costInUsd,
                ...(opening ? { opening } : {}),
                callInfo: { skill: this.name, skillVersion: this.version, mode, model: response.model, provider: response.provider ?? provider, blocks: reading.blocks, ...(rawText ? { rawText } : {}) },
            }

            const reasoning = (result as any)?.reasoning

            chat?.addTrace({ node: this.name, reasoning })

            return result
        } catch (error: any) {
            chat?.addTrace({ node: this.name, reasoning: `Failed: ${error?.message ?? error}` })
            throw error
        }
    }

    private parseJsonResponse<T> (text?: string): T {
        if (!text) throw new Error('LLM response text is empty or invalid')

        const content = extractJSON(text)
        if (!content) throw new Error('Failed to extract JSON from LLM response')

        return content as T
    }
}
