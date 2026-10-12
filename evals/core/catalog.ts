import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Api, AssistantMessage, KnownProvider, Model } from '@earendil-works/pi-ai'
import { userMessage } from './util'

export const FORCED_BY_API: Record<string, string> = {
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

export async function loadModels () {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
    return builtinModels() as any
}

export function piAiVersion () {
    try {
        return JSON.parse(readFileSync(join(process.cwd(), 'node_modules/@earendil-works/pi-ai/package.json'), 'utf8')).version as string
    } catch {
        return 'unknown'
    }
}

export function findModel (models: any, provider: string, id: string) {
    return (models.getModelOfType?.('chat', provider as KnownProvider, id) ?? models.getModel(provider as KnownProvider, id as never)) as Model<Api> | undefined
}

export async function checkAccess (models: any, model: Model<Api>, timeoutMs = 30000) {
    try {
        const ping: AssistantMessage = await models.completeSimple(model, { systemPrompt: 'Reply with ok.', messages: [userMessage('ping')], tools: [] } as any, { maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) })
        return ping.stopReason === 'error' ? String(ping.errorMessage ?? 'error').slice(0, 200) : undefined
    } catch (error: any) {
        return String(error?.message ?? error).slice(0, 200)
    }
}

export function reasoningFor (model: Model<Api>, level: string) {
    if (level === 'n/a') return undefined
    if (level === 'off') return String(model.api).startsWith('openai') ? 'minimal' : undefined
    return level
}

export function incompatibility (model: Model<Api>, forcesToolChoice: boolean, level: string) {
    if (forcesToolChoice && !FORCED_BY_API[model.api]) return 'no forced tool choice mapping for this api'
    if (forcesToolChoice && model.api === 'anthropic-messages' && level !== 'off') return 'anthropic rejects thinking when tool choice is forced'
    return undefined
}
