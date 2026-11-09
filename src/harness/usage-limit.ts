import { CurrentUser } from '@common/base'
import { getLLMUsageStats } from '@services/llmcalls'
import { LimitPeriod, resolveLimitRange, resolveTimezone } from '@services/llmcalls/utils/usage-periods'

export const USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED'

const PERIODS: LimitPeriod[] = ['day', 'week', 'month']

export interface UsageLimit {
    maxCostUsd: number
    period: LimitPeriod
}

export class UsageLimitError extends Error {
    readonly code = USAGE_LIMIT_REACHED
    readonly isRetryable = false
    readonly userMessage: string

    constructor (readonly used: number, readonly limit: number, readonly period: LimitPeriod) {
        super(`[Usage limit] ${used} of ${limit} USD spent this ${period}`)
        this.userMessage = `The usage limit of this ${period} has been reached.`
    }
}

export function validateUsageLimit (usageLimit: UsageLimit): void {
    if (!Number.isFinite(usageLimit.maxCostUsd) || usageLimit.maxCostUsd <= 0) throw new Error('[AGENT] usageLimit.maxCostUsd must be a number greater than 0')
    if (!PERIODS.includes(usageLimit.period)) throw new Error(`[AGENT] usageLimit.period must be one of ${PERIODS.join(', ')}`)
}

export async function checkUsageLimit (usageLimit: UsageLimit, currentUser: CurrentUser): Promise<void> {
    const { maxCostUsd, period } = usageLimit
    const timezone = resolveTimezone(currentUser.preferences?.timezone?.ianaIdentifier)
    const { from, to } = resolveLimitRange(period, timezone)
    const { summary } = await getLLMUsageStats({ filters: { fromDate: from, toDate: to, groupBy: 'month' }, currentUser })

    if (summary.totalCost >= maxCostUsd) throw new UsageLimitError(summary.totalCost, maxCostUsd, period)
}
