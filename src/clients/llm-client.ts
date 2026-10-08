import { Langfuse } from 'langfuse'
import type {
    KnownProvider,
    Message,
    AssistantMessage,
    Context
} from '@earendil-works/pi-ai'

import { secretManager } from '@common/utils/secret-manager'
import { CurrentUser } from '@common/base'
import { Logger } from '@common/logger'
import { extractJSON } from '@common/helpers'
import { createLLMCall } from '@services/llmcalls'
import { LLMChatParams, LLMResponse } from './llm-types'
import { toPiContext, fromPiMessage } from './pi-ai-adapter'
import { LLMError, retryDelayMs } from './llm-error'

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = 0.7
const MAX_RETRIES = 4
const MAX_RATE_LIMIT_WAITS = 2

interface TracedCall {
    origin: string
    sessionId: string
    answerId: string
    currentUser?: CurrentUser
    modelName: string
    provider: string
    temperature: number
}

export class LLMClient {
    private readonly logger = new Logger()
    private readonly langfuse?: Langfuse
    private readonly langfuseEnabled: boolean

    constructor () {
        process.env.OPENAI_API_KEY = secretManager.get('OPENAI_API_KEY')

        const publicKey = secretManager.get('LANGFUSE_PUBLIC_KEY')
        const secretKey = secretManager.get('LANGFUSE_SECRET_KEY')
        const baseUrl = secretManager.get('LANGFUSE_BASE_URL')

        this.langfuseEnabled = Boolean(publicKey && secretKey && baseUrl)

        if (this.langfuseEnabled) {
            this.langfuse = new Langfuse({ publicKey, secretKey, baseUrl })
            this.logger.debug('[LLM Service] Langfuse enabled')
        } else {
            this.logger.debug('[LLM Service] Langfuse disabled: configuration variables missing')
        }
    }

    async chat (params: LLMChatParams): Promise<LLMResponse> {
        const {
            origin,
            sessionId,
            answerId,
            currentUser,
            messages,
            tools,
            toolChoice,
            provider = DEFAULT_PROVIDER,
            modelName = DEFAULT_MODEL,
            temperature = DEFAULT_TEMPERATURE,
        } = params

        const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
        const models = builtinModels()
        const model = models.getModel(provider as KnownProvider, modelName as never)

        if (!model) throw new Error('[LLM Client] model not found')

        const context = toPiContext({ messages, tools }, model)
        const options = { temperature, maxRetries: MAX_RETRIES, ...(sessionId ? { sessionId } : {}) }

        const raw = await this.traced(
            { origin, sessionId, answerId, currentUser, modelName, provider, temperature },
            context,
            () => this.waitingOnRateLimit(() => toolChoice
                ? models.completeSimple(model, context, { ...options, toolChoice })
                : models.complete(model, context, options)),
        )

        if (raw.stopReason === 'error' || raw.stopReason === 'aborted') {
            throw LLMError.fromProvider(raw.errorMessage ?? `request ${raw.stopReason}`)
        }

        return fromPiMessage(raw)
    }

    /**
     * @deprecated Use chat(). Kept so callers that still depend on the provider message shape keep working.
     */
    async complete (params: LLMCompletionParams): Promise<AssistantMessage> {
        const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
        const models = builtinModels()

        const {
            origin,
            sessionId,
            answerId,
            currentUser,
            systemPrompt,
            messages,
            provider = DEFAULT_PROVIDER,
            modelName = DEFAULT_MODEL,
            temperature = DEFAULT_TEMPERATURE
        } = params ?? {}

        const model = models.getModel(provider, modelName as never)

        if (!model) throw new Error('[LLM Client] model not found')

        const context: Context = {
            systemPrompt,
            messages,
        }

        return this.traced(
            { origin, sessionId, answerId, currentUser, modelName, provider, temperature },
            context,
            () => this.waitingOnRateLimit(() => models.complete(model, context, { temperature, maxRetries: MAX_RETRIES })),
        )
    }

    private async waitingOnRateLimit (run: () => Promise<AssistantMessage>): Promise<AssistantMessage> {
        let response = await run()

        for (let waits = 0; waits < MAX_RATE_LIMIT_WAITS && response.stopReason === 'error'; waits++) {
            const delay = LLMError.fromProvider(response.errorMessage ?? '').code === 'LLM_RATE_LIMITED' ? retryDelayMs(response.errorMessage) : undefined
            if (!delay) break

            this.logger.warn({ waitMs: delay }, '[LLM Service] Rate limited, waiting before retrying')
            await new Promise(resolve => setTimeout(resolve, delay))
            response = await run()
        }

        return response
    }

    private async traced (call: TracedCall, context: Context, run: () => Promise<AssistantMessage>): Promise<AssistantMessage> {
        const { origin, sessionId, answerId, currentUser, modelName, provider, temperature } = call

        this.logger.debug({
            origin,
            context: {
                ...context,
                ...(context.systemPrompt ? { systemPrompt: this.formatTextForLog(context.systemPrompt) } : {}),
                messages: this.formatMessagesForLog(context.messages),
            }
        }, '[LLM Service] context')

        const trace = this.langfuseEnabled ? this.langfuse!.trace({
            sessionId,
            name: origin,
            userId: currentUser?.userId,
            metadata: {
                origin,
                email: currentUser?.email,
                sessionId,
            },
        }) : undefined

        const generation = trace?.generation({
            name: 'llm-completion',
            model: modelName,
            modelParameters: { temperature, provider },
            input: context,
        })

        try {
            const response = await run()

            generation?.end({
                output: response,
                usage: response.usage ? {
                    promptTokens: response.usage.input,
                    completionTokens: response.usage.output,
                    totalTokens: response.usage.totalTokens,
                } : undefined,
            })

            if (this.langfuseEnabled) await this.langfuse!.flushAsync()

            this.logger.debug({
                origin,
                response: {
                    ...response,
                    content: this.formatContentForLog(response?.content)
                }
            }, '[LLM Service] Response')

            await this.postResponse({ origin, sessionId, answerId, currentUser, response })

            return response
        } catch (error) {
            generation?.end({
                level: 'ERROR',
                statusMessage: (error as Error).message,
            })
            if (this.langfuseEnabled) await this.langfuse!.flushAsync()
            throw error
        }
    }

    private async postResponse (params: LLMPostResponseParams): Promise<any>  {
        const { origin, sessionId, answerId, currentUser, response } = params ?? {}

        await createLLMCall({
            payload: {
                origin,
                sessionId,
                answerId,
                response,
                costInUsd: response?.usage?.cost?.total,
            },
            currentUser
        })
    }

    private formatContentForLog (records?: any[]): any[] | undefined {
        return records?.map((record: any) => {
            if (record?.type !== 'text') return record

            return { ...record, text: this.formatTextForLog(record?.text) }
        })
    }

    private formatTextForLog (text: any): any {
        if (typeof text !== 'string') return text

        const extracted = extractJSON(text)
        const isJson = extracted && Object.keys(extracted).length > 0

        return isJson ? extracted : text
    }

    private formatMessagesForLog (messages: Message[]): Message[] {
        return messages.map((message: any) => ({
            ...message,
            content: Array.isArray(message?.content) ? this.formatContentForLog(message.content) : this.formatTextForLog(message?.content)
        }))
    }
}

export interface LLMCompletionParams {
    origin: string
    sessionId: string
    answerId: string
    currentUser?: CurrentUser
    systemPrompt?: string
    messages: Message[]
    provider?: KnownProvider
    modelName?: string
    temperature?: number
}

export interface LLMPostResponseParams {
    origin: string
    sessionId: string
    answerId: string
    currentUser?: CurrentUser
    response: AssistantMessage
}
