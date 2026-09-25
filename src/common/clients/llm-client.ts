import 'reflect-metadata'
import { container } from 'tsyringe'

import { Langfuse } from 'langfuse'
import type {
    KnownProvider,
    Message,
    AssistantMessage,
    Context
} from '@mariozechner/pi-ai'

import { secretManager } from '@common/utils/secret-manager'
import { CurrentUser } from '@services/app/core'
import { Logger } from '@common/logger'
import { extractJSON } from '@common/helpers'
import { CreateLLMCallUseCase } from '@services/agent/modules/llmcalls/lambdas/create-llmcall'

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

    async complete (params: LLMCompletionParams): Promise<AssistantMessage> {
        const { getModel, complete } = await import('@mariozechner/pi-ai')

        const {
            taskName,
            sessionId,
            answerId,
            currentUser,
            systemPrompt,
            messages,
            provider = 'openai',
            modelName = 'gpt-4o-mini',
            temperature = 0.7
        } = params ?? {}

        const model = getModel(provider, modelName as never)

        const context: Context = {
            systemPrompt,
            messages,
        }

        this.logger.debug({
            taskName,
            context: {
                ...context,
                messages: this.formatMessagesForLog(messages),
            }
        }, '[LLM Service] context')

        const trace = this.langfuseEnabled ? this.langfuse!.trace({
            sessionId,
            name: taskName,
            userId: currentUser?.userId,
            metadata: {
                taskName: taskName,
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
            const response = await complete(model, context, {
                temperature,
            })

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
                taskName,
                response: {
                    ...response,
                    content: this.formatContentForLog(response?.content)
                }
            }, '[LLM Service] Response')

            await this.postResponse({ taskName, sessionId, answerId, currentUser, response })

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
        const { taskName, sessionId, answerId, currentUser, response } = params ?? {}
        const createLLMCallUseCase = container.resolve(CreateLLMCallUseCase)

        await createLLMCallUseCase.execute({
            payload: {
                taskName,
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
            const text = record?.text
            const extracted = extractJSON(text)
            const isJson = Object.keys(extracted).length > 0

            return {
                ...record,
                text: isJson ? extracted : text
            }
        })
    }

    private formatMessagesForLog (messages: Message[]): Message[] {
        return messages.map((message: any) => ({
            ...message,
            content: this.formatContentForLog(message?.content) ?? message?.content
        }))
    }
}

export interface LLMCompletionParams {
    taskName: string
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
    taskName: string
    sessionId: string
    answerId: string
    currentUser?: CurrentUser
    response: AssistantMessage
}
