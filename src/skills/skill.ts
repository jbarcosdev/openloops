import { container } from 'tsyringe'
import { extractJSON } from '@common/helpers'
import { LLMClient } from '@clients/llm-client'
import { CurrentUser, CurrentSession } from '@common/base'
import type { Chat } from '@services/chats/entities/chat.entity'

export interface SkillProps {
    name: string
    version?: string
    description?: string
    temperature?: number
    systemInstructions: Record<string, any>
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
}

export class Skill<TResponse = Record<string, any>> {
    readonly name: string
    readonly version?: string
    readonly description?: string
    readonly temperature?: number
    readonly systemInstructions: Record<string, any>

    constructor (props: SkillProps) {
        this.name = props.name
        this.version = props.version
        this.description = props.description
        this.temperature = props.temperature
        this.systemInstructions = props.systemInstructions
    }

    async run (options: SkillRunOptions): Promise<TResponse & { responseId: string, costInUsd: number }> {
        const { provider, modelName, sessionId, answerId, userMessage, currentUser, currentSession, contextInjection = {}, input = {}, chat } = options

        try {
            const llmClient = container.resolve(LLMClient)

            const currentCountryCode = currentSession?.location?.country
            const currentCurrencyCode = currentSession?.currencyCode

            const now = new Date()
            const timezone = currentSession?.location?.timezone
            const nowLocal = timezone ? now.toLocaleString('sv-SE', { timeZone: timezone }) : undefined

            const payload = {
                SYSTEM_INSTRUCTIONS: {
                    ...this.systemInstructions,
                },
                CONTEXT: {
                    now_utc: new Date().toISOString(),
                    now_local: nowLocal,
                    timezone: currentSession?.location?.timezone,
                    day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
                    ...(chat?.state?.language ? { detected_language: chat.state.language } : {}),
                    ...(currentUser ?
                        {
                            user_details: {
                                first_name: currentUser?.firstName,
                                last_name: currentUser?.lastName,

                                // Configuración/Preferencias del usuario
                                preferred_language: currentUser?.language,
                                residence_country_code: currentUser?.preferences?.country?.isoCode,
                                preferred_currency_code: currentUser?.preferences?.currency?.isoCode,
                            }
                        } : {}
                    ),
                    ...(currentSession ?
                        {
                            session_details: {
                                current_location: {
                                    country_code: currentCountryCode,
                                    currency_code: currentCurrencyCode,
                                    timezone_offset: currentSession?.timezoneOffset,
                                },
                                client_info: {
                                    platform: currentSession?.device?.os,
                                    brand: currentSession?.device?.brand,
                                    model: currentSession?.device?.model,
                                }
                            }
                        } : {}
                    ),
                    ...contextInjection,
                },
                INPUT: {
                    ...(userMessage ? { user_message: userMessage } : {}),
                    ...input,
                },
            }

            const response = await llmClient.complete({
                provider: provider as any,
                modelName,
                sessionId,
                answerId,
                origin: this.name,
                currentUser,
                messages: [
                    {
                        role: 'user',
                        timestamp: Date.now(),
                        content: [{ type: 'text', text: JSON.stringify(payload) }],
                    },
                ],
                temperature: this.temperature ?? 0.7,
            })

            const result = {
                ...this.parseJsonResponse<TResponse>(response),
                responseId: response.responseId ?? '',
                costInUsd: response?.usage?.cost?.total,
            }

            chat?.addTrace({ node: this.name, reasoning: (result as any)?.reasoning })

            return result
        } catch (error: any) {
            chat?.addTrace({ node: this.name, reasoning: `Failed: ${error?.message ?? error}` })
            throw error
        }
    }

    private parseJsonResponse<T> (response: any): T {
        const rawContent = response?.content ?? []
        const text = rawContent[0]?.type === 'text' ? rawContent[0].text : undefined

        if (!text) throw new Error('LLM response text is empty or invalid')

        const content = extractJSON(text)
        if (!content) throw new Error('Failed to extract JSON from LLM response')

        return content as T
    }
}
