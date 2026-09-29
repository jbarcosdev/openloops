import { autoInjectable } from 'tsyringe'
import { extractJSON } from '@common/helpers'
import { LLMClient } from '@clients/llm-client'
import { CurrentUser, CurrentSession } from '@common/core'

interface SkillDefinition<TResponse = Record<string, any>> {
    name: string
    version?: string
    description?: string
    temperature?: number
    systemInstructions: Record<string, any>

    // Tipo fantasma que conecta TResponse con la definición
    readonly _responseType?: TResponse
}

export interface SkillExecuteOptions<TResponse = any, TInput = Record<string, any>> {
    skill: SkillDefinition<TResponse>
    sessionId: string
    answerId: string
    userMessage?: string // cuando es una skill tipo extracción o planner no tiene userMessage
    currentUser?: CurrentUser
    currentSession?: CurrentSession
    contextInjection?: Record<string, any>
    input?: TInput
}

@autoInjectable()
export class SkillRunner {
    constructor(private readonly llmClient: LLMClient) {}

    async execute<TResponse>(options: SkillExecuteOptions<TResponse>): Promise<TResponse & { responseId: string, costInUsd: number }> {
        const { skill, sessionId, answerId, userMessage, currentUser, currentSession, contextInjection = {}, input = {} } = options

        const currentCountryCode = currentSession?.location?.country
        const currentCurrencyCode = currentSession?.currencyCode

        const now = new Date()
        const timezone = currentSession?.location?.timezone
        const nowLocal = timezone ? now.toLocaleString('sv-SE', { timeZone: timezone }) : undefined

        const payload = {
            SYSTEM_INSTRUCTIONS: {
                ...skill.systemInstructions,
            },
            CONTEXT: {
                now_utc: new Date().toISOString(),
                now_local: nowLocal,
                timezone: currentSession?.location?.timezone,
                day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
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

        const response = await this.llmClient.complete({
            sessionId,
            answerId,
            taskName: skill.name,
            currentUser,
            messages: [
                {
                    role: 'user',
                    timestamp: Date.now(),
                    content: [{ type: 'text', text: JSON.stringify(payload) }],
                },
            ],
            temperature: skill.temperature ?? 0.7,
        })

        return { 
            ...this.parseJsonResponse<TResponse>(response),
            responseId: response.responseId ?? '',
            costInUsd: response?.usage?.cost?.total,
        }
    }

    private parseJsonResponse<T>(response: any): T {
        const rawContent = response?.content ?? []
        const text = rawContent[0]?.type === 'text' ? rawContent[0].text : undefined

        if (!text) throw new Error('LLM response text is empty or invalid')

        const content = extractJSON(text)
        if (!content) throw new Error('Failed to extract JSON from LLM response')

        return content as T
    }
}
