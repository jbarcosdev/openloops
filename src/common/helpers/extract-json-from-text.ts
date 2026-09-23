export function extractJSON(plainText?: string): Partial<Record<string, any>> {
    if (!plainText) {
        return {}
    }

    const start = plainText.indexOf('{')
    if (start === -1) return {}

    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < plainText.length; i++) {
        const char = plainText[i]

        if (escaped) {
            escaped = false
            continue
        }

        if (char === '\\') {
            escaped = true
            continue
        }

        if (char === '"') {
            inString = !inString
            continue
        }

        if (inString) continue

        if (char === '{') depth++
        else if (char === '}') depth--

        if (depth === 0) {
            try {
                return JSON.parse(plainText.substring(start, i + 1))
            } catch {
                return {}
            }
        }
    }

    return {}
}
