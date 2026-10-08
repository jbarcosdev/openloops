import { container } from 'tsyringe'
import { extractJSON } from '@common/helpers'
import { LLMClient } from '@clients/llm-client'
import { LLMMessage, LLMToolDefinition, LLMToolChoice } from '@clients/llm-types'
import { CurrentUser, CurrentSession } from '@common/base'
import type { Chat } from '@services/chats/entities/chat.entity'
import { buildRuntimeContext } from './runtime-context'

export interface SkillProps {
    name: string
    version?: string
    description?: string
    temperature?: number
    systemInstructions: Record<string, any>
    systemRole?: boolean
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
    tools?: LLMToolDefinition[]
    toolChoice?: LLMToolChoice
}

export class Skill<TResponse = Record<string, any>> {
    readonly name: string
    readonly version?: string
    readonly description?: string
    readonly temperature?: number
    readonly systemInstructions: Record<string, any>
    readonly systemRole: boolean

    constructor (props: SkillProps) {
        this.name = props.name
        this.version = props.version
        this.description = props.description
        this.temperature = props.temperature
        this.systemInstructions = props.systemInstructions
        this.systemRole = props.systemRole ?? false
    }

    async run (options: SkillRunOptions): Promise<TResponse & { responseId: string, costInUsd: number, opening?: string }> {
        const { provider, modelName, sessionId, answerId, userMessage, currentUser, currentSession, contextInjection = {}, input = {}, chat, history = [], tools, toolChoice } = options

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

            const conversation: LLMMessage[] = continuing ? history : [{ role: 'user', content: opening! }]

            const messages: LLMMessage[] = this.systemRole
                ? [{ role: 'system', content: JSON.stringify(this.systemInstructions) }, ...conversation]
                : conversation

            const response = await llmClient.chat({
                provider,
                modelName,
                sessionId,
                answerId,
                origin: this.name,
                currentUser,
                messages,
                tools,
                toolChoice,
                temperature: this.temperature ?? 0.7,
            })

            const parsed = this.parseJsonResponse<TResponse>(response.text)

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
