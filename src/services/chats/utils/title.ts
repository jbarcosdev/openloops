export const MAX_TITLE_LENGTH = 80

export function normalizeTitle (text?: string): string | undefined {
    if (typeof text !== 'string') return undefined

    const title = Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, MAX_TITLE_LENGTH).join('').trim()

    return title || undefined
}
