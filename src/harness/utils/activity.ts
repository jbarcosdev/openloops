const MAX_ACTIVITY_LENGTH = 80
const RESERVED_ACTIVITIES = ['running', 'stopped']

export function cleanActivity (value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined

    const text = value.replace(/[`*_#>\[\]{}<>|\\]/g, ' ').replace(/\s+/g, ' ').trim()

    if (!text || RESERVED_ACTIVITIES.includes(text.toLowerCase())) return undefined
    if (text.length <= MAX_ACTIVITY_LENGTH) return text

    const cut = text.slice(0, MAX_ACTIVITY_LENGTH).replace(/\s+\S*$/, '').trim()

    return cut ? `${cut}...` : undefined
}
