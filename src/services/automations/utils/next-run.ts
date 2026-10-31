import { Cron } from 'croner'
import { Recurrence, toCronPattern } from '../entities/recurrence'

const MAX_PREVIEW = 20

export function assertTimezone (timezone: unknown): string {
    if (typeof timezone !== 'string' || !timezone.trim()) throw new Error('The timezone is required')

    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    } catch {
        throw new Error(`The timezone "${timezone}" is not a valid IANA timezone`)
    }

    return timezone
}

export function computeNextRun (recurrence: Recurrence, timezone: string, from: Date = new Date()): Date | null {
    const pattern = recurrence.type === 'once' ? `${recurrence.at}:00` : toCronPattern(recurrence)!
    const cron = new Cron(pattern, { timezone })

    let next = cron.nextRun(from)

    while (next && next.getTime() <= from.getTime()) next = cron.nextRun(next)

    return next
}

export function previewNextRuns (recurrence: Recurrence, timezone: string, count: number, from: Date = new Date()): Date[] {
    const runs: Date[] = []
    const limit = Math.min(Math.max(Math.floor(count), 0), MAX_PREVIEW)

    let cursor = from

    while (runs.length < limit) {
        const next = computeNextRun(recurrence, timezone, cursor)
        if (!next) break

        runs.push(next)
        cursor = next
    }

    return runs
}
