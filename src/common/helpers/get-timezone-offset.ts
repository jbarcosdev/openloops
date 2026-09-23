import { DateTime } from 'luxon'

export function getTimezoneOffset(timezone?: string): number {
    if (!timezone) return 0

    const now = DateTime.now().setZone(timezone)
    const offsetInMinutes = !isNaN(now.offset) ? now.offset : 0

    return offsetInMinutes
}
