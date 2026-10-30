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
import { numberSetting } from '@common/utils/number-setting'
import { resolveModel, toModelRef } from './model-resolution'
import { LLMError, retryDelayMs, rejectsSamplingParameter } from './llm-error'

const DEFAULT_TEMPERATURE = 0.7
const MAX_RETRIES = 4
const MAX_RATE_LIMIT_WAITS = 2
const DEFAULT_CALL_TIMEOUT_MS = 60000
const MAX_TIMEOUT_RETRIES = 2
const LANGFUSE_FLUSH_TIMEOUT_MS = 5000

const REQUIRED_TOOL_CHOICE: Record<string, string> = {
    'anthropic-messages': 'any',
    'bedrock-converse-stream': 'any',
    'google-generative-ai': 'any',
    'google-vertex': 'any',
    'mistral-conversations': 'any',
    'openai-completions': 'required',
    'openai-responses': 'required',
    'azure-openai-responses': 'required',
    'openai-codex-responses': 'required',
}

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
    private static readonly modelsWithoutTemperature = new Set<string>()

    private readonly logger = new Logger()
    private readonly langfuse?: Langfuse
    private readonly langfuseEnabled: boolean
    private readonly callTimeoutMs: number

    constructor () {
        process.env.OPENAI_API_KEY = secretManager.get('OPENAI_API_KEY')
        process.env.ANTHROPIC_API_KEY = secretManager.get('ANTHROPIC_API_KEY')

        this.callTimeoutMs = numberSetting('LLM_CALL_TIMEOUT_MS', DEFAULT_CALL_TIMEOUT_MS)

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
            temperature = DEFAULT_TEMPERATURE,
            thinking,
        } = params

        const { provider, model: modelName } = this.chooseModel(params)

        const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
        const models = builtinModels()
        const model = models.getModel(provider as KnownProvider, modelName as never)

        if (!model) throw new Error('[LLM Client] model not found')

        const resolvedChoice = toolChoice === 'required' ? REQUIRED_TOOL_CHOICE[model.api] : toolChoice
        if (toolChoice === 'required' && !resolvedChoice) throw new Error(`[LLM Client] forced tool choice is not supported for api ${model.api}`)

        const context = toPiContext({ messages, tools }, model)
        const send = (omitTemperature: boolean) => this.withDeadline(signal => {
            const options = { ...(omitTemperature ? {} : { temperature }), maxRetries: MAX_RETRIES, signal, ...(sessionId ? { sessionId } : {}) }

            const reasoning = thinking && thinking !== 'off' ? thinking : undefined

            return resolvedChoice || thinking
                ? models.completeSimple(model, context, { ...options, ...(resolvedChoice ? { toolChoice: resolvedChoice as never } : {}), ...(reasoning ? { reasoning } : {}) })
                : models.complete(model, context, options)
        })

        const raw = await this.traced(
            { origin, sessionId, answerId, currentUser, modelName, provider, temperature },
            context,
            () => this.withoutRejectedTemperature(`${provider}/${modelName}`, send),
        )

        if (raw.stopReason === 'error' || raw.stopReason === 'aborted') {
            throw LLMError.fromProvider(raw.errorMessage ?? `request ${raw.stopReason}`)
        }

        return fromPiMessage(raw)
    }

    private chooseModel (params: { provider?: string, modelName?: string, currentUser?: CurrentUser }) {
        const { provider, modelName, currentUser } = params ?? {}

        if (Boolean(provider) !== Boolean(modelName)) throw new Error('[LLM Client] provider and modelName must be given together')

        return resolveModel({
            run: toModelRef({ provider, model: modelName }),
            user: toModelRef(currentUser?.preferences?.defaultModel),
        })
    }

    private async withDeadline (call: (signal: AbortSignal) => Promise<AssistantMessage>): Promise<AssistantMessage> {
        for (let attempt = 1; attempt <= MAX_TIMEOUT_RETRIES + 1; attempt++) {
            const controller = new AbortController()
            let timer: NodeJS.Timeout | undefined

            const deadline = new Promise<undefined>(resolve => {
                timer = setTimeout(() => {
                    controller.abort()
                    resolve(undefined)
                }, this.callTimeoutMs)
            })

            const pending = call(controller.signal)
            pending.catch(() => undefined)

            const response = await Promise.race([pending, deadline]).finally(() => clearTimeout(timer))

            if (response) return response

            this.logger.warn({ attempt, timeoutMs: this.callTimeoutMs }, '[LLM Service] The model did not answer in time')
        }

        throw new LLMError('LLM_TIMEOUT', `the model did not answer within ${this.callTimeoutMs} ms in ${MAX_TIMEOUT_RETRIES + 1} attempts`)
    }

    private async flushLangfuse (): Promise<void> {
        if (!this.langfuseEnabled) return

        let timer: NodeJS.Timeout | undefined
        const deadline = new Promise<'timeout'>(resolve => {
            timer = setTimeout(() => resolve('timeout'), LANGFUSE_FLUSH_TIMEOUT_MS)
        })

        try {
            const outcome = await Promise.race([this.langfuse!.flushAsync().then(() => 'flushed' as const), deadline])
            if (outcome === 'timeout') this.logger.warn({ timeoutMs: LANGFUSE_FLUSH_TIMEOUT_MS }, '[LLM Service] Langfuse did not flush in time, continuing')
        } catch (error: any) {
            this.logger.warn({ error: error?.message ?? error }, '[LLM Service] Langfuse flush failed, continuing')
        } finally {
            clearTimeout(timer)
        }
    }

    private async withoutRejectedTemperature (key: string, send: (omitTemperature: boolean) => Promise<AssistantMessage>): Promise<AssistantMessage> {
        const known = LLMClient.modelsWithoutTemperature.has(key)
        const response = await this.waitingOnRateLimit(() => send(known))

        if (known || response.stopReason !== 'error' || !rejectsSamplingParameter(response.errorMessage)) return response

        LLMClient.modelsWithoutTemperature.add(key)
        this.logger.warn({ model: key, error: response.errorMessage }, '[LLM Service] The model rejected the temperature setting, retrying without it')

        return this.waitingOnRateLimit(() => send(true))
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
                ...(context.systemPrompt ? { systemPrompt: this.formatSystemForLog(context.systemPrompt) } : {}),
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

            await this.flushLangfuse()

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
            await this.flushLangfuse()
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

    private formatSystemForLog (systemPrompt: string): any {
        const parts = systemPrompt.split('\n\n').filter(Boolean)

        return parts.length > 1 ? parts.map(part => this.formatTextForLog(part)) : this.formatTextForLog(systemPrompt)
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

export interface LLMPostResponseParams {
    origin: string
    sessionId: string
    answerId: string
    currentUser?: CurrentUser
    response: AssistantMessage
}
