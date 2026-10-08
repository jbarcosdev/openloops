export type LLMErrorCode = 'LLM_RATE_LIMITED' | 'LLM_QUOTA_EXCEEDED' | 'LLM_UNAVAILABLE' | 'LLM_FAILED'

const USER_MESSAGES: Record<LLMErrorCode, string> = {
    LLM_RATE_LIMITED: 'The model is receiving too many requests right now. Please try again in a few seconds.',
    LLM_QUOTA_EXCEEDED: 'The usage quota of the model provider has been exhausted. Please check the plan and billing of the provider.',
    LLM_UNAVAILABLE: 'The model provider is temporarily unavailable. Please try again in a moment.',
    LLM_FAILED: 'The model request failed. Please try again.',
}

const RETRYABLE: Record<LLMErrorCode, boolean> = {
    LLM_RATE_LIMITED: true,
    LLM_QUOTA_EXCEEDED: false,
    LLM_UNAVAILABLE: true,
    LLM_FAILED: true,
}

const MAX_WAIT_MS = 60000

export class LLMError extends Error {
    readonly code: LLMErrorCode
    readonly isRetryable: boolean
    readonly userMessage: string

    constructor (code: LLMErrorCode, detail: string) {
        super(`[LLM Client] ${detail}`)
        this.code = code
        this.isRetryable = RETRYABLE[code]
        this.userMessage = USER_MESSAGES[code]
    }

    static fromProvider (detail: string): LLMError {
        return new LLMError(classify(detail), detail)
    }
}

function classify (detail: string): LLMErrorCode {
    if (/PerDay|per day|billing|insufficient_quota|exceeded your current quota[\s\S]*(daily|day)/i.test(detail) && !/per.?min/i.test(detail)) return 'LLM_QUOTA_EXCEEDED'
    if (/\b429\b|rate.?limit|RESOURCE_EXHAUSTED|too many requests/i.test(detail)) return 'LLM_RATE_LIMITED'
    if (/\b50[0-9]\b|unavailable|overloaded|timeout|timed out|econn|network/i.test(detail)) return 'LLM_UNAVAILABLE'
    return 'LLM_FAILED'
}

export function retryDelayMs (detail?: string): number | undefined {
    if (!detail) return undefined

    const match = detail.match(/"retryDelay\\*"\s*:\s*\\*"(\d+(?:\.\d+)?)s/) ?? detail.match(/retry in (\d+(?:\.\d+)?)s/i)
    if (!match) return undefined

    const ms = Math.ceil(Number(match[1]) * 1000) + 1000

    return ms <= MAX_WAIT_MS ? ms : undefined
}
