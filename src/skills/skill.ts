import { container } from 'tsyringe'
import { extractJSON } from '@common/helpers'
import { LLMClient } from '@clients/llm-client'
import { LLMMessage, LLMToolDefinition } from '@clients/llm-types'
import { CurrentUser, CurrentSession } from '@common/base'
import type { Chat } from '@services/chats/entities/chat.entity'
import { buildRuntimeContext } from './runtime-context'
import { SkillMode, DEFAULT_SKILL_MODE, buildModeCall, readModeResponse } from './call-modes'

export { SkillMode, DEFAULT_SKILL_MODE } from './call-modes'

const RESERVED_CONTEXT_KEYS = ['tools', 'mode', 'history', 'chatHistory']

export interface SkillProps {
    name: string
    version?: string
    description?: string
    temperature?: number
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

export class Skill<TResponse = Record<string, any>> {
    readonly name: string
    readonly version?: string
    readonly description?: string
    readonly temperature?: number
    readonly systemInstructions: Record<string, any>
    readonly systemRole: boolean
    readonly mode: SkillMode

    constructor (props: SkillProps) {
        this.name = props.name
        this.version = props.version
        this.description = props.description
        this.temperature = props.temperature
        this.systemInstructions = props.systemInstructions
        this.systemRole = props.systemRole ?? true
        this.mode = props.mode ?? DEFAULT_SKILL_MODE
    }

    async run (options: SkillRunOptions): Promise<TResponse & { responseId: string, costInUsd: number, opening?: string }> {
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
            })

            const parsed = this.parseJsonResponse<TResponse>(readModeResponse(mode, this.name, response))

            const result = {
                ...parsed,
                responseId: response.responseId ?? '',
                costInUsd: response.usage.costInUsd,
                ...(opening ? { opening } : {}),
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
