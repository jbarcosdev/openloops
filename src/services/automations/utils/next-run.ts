import { Cron } from 'croner'
import { Recurrence, intervalToMinutes, toCronPattern } from '../entities/recurrence'

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

function computeNextInterval (recurrence: Extract<Recurrence, { type: 'interval' }>, timezone: string, from: Date): Date | null {
    const start = new Cron(`${recurrence.start}:00`, { timezone }).nextRun(new Date(0))
    if (!start) return null

    const step = intervalToMinutes(recurrence.every, recurrence.unit) * 60 * 1000
    if (from.getTime() < start.getTime()) return start

    const elapsed = Math.floor((from.getTime() - start.getTime()) / step) + 1

    return new Date(start.getTime() + elapsed * step)
}

export function computeNextRun (recurrence: Recurrence, timezone: string, from: Date = new Date()): Date | null {
    if (recurrence.type === 'interval') return computeNextInterval(recurrence, timezone, from)

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
