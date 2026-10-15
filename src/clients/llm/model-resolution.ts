import { secretManager } from '@common/utils/secret-manager'
import { logger } from '@common/logger'

export interface ModelRef {
    provider: string
    model: string
}

export type ModelSource = 'run' | 'chat' | 'user' | 'agent' | 'backend' | 'client'

export const CLIENT_FALLBACK_MODEL: ModelRef = { provider: 'anthropic', model: 'claude-haiku-5-5' }

let warnedAboutBackendFallback = false

export function toModelRef (value?: { provider?: unknown, model?: unknown } | null): ModelRef | undefined {
    const provider = typeof value?.provider === 'string' ? value.provider.trim() : ''
    const model = typeof value?.model === 'string' ? value.model.trim() : ''

    return provider && model ? { provider, model } : undefined
}

export function backendFallbackModel (): ModelRef | undefined {
    const provider = secretManager.get('LLM_FALLBACK_PROVIDER')
    const model = secretManager.get('LLM_FALLBACK_MODEL')

    if (Boolean(provider) !== Boolean(model)) {
        if (!warnedAboutBackendFallback) {
            warnedAboutBackendFallback = true
            logger.warn('[LLM Client] LLM_FALLBACK_PROVIDER and LLM_FALLBACK_MODEL must be set together, so they are ignored')
        }

        return undefined
    }

    return toModelRef({ provider, model })
}

export function resolveModel (levels: { run?: ModelRef, chat?: ModelRef, user?: ModelRef, agent?: ModelRef }): ModelRef & { source: ModelSource } {
    if (levels.run) return { ...levels.run, source: 'run' }
    if (levels.chat) return { ...levels.chat, source: 'chat' }
    if (levels.user) return { ...levels.user, source: 'user' }
    if (levels.agent) return { ...levels.agent, source: 'agent' }

    const backend = backendFallbackModel()
    if (backend) return { ...backend, source: 'backend' }

    return { ...CLIENT_FALLBACK_MODEL, source: 'client' }
}

export async function isKnownModel (provider: string, model: string): Promise<boolean> {
    try {
        const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
        return Boolean(builtinModels().getModel(provider as never, model as never))
    } catch {
        return false
    }
}
