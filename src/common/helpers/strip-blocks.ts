function asciiLower (text: string): string {
    return text.replace(/[A-Z]/g, char => String.fromCharCode(char.charCodeAt(0) + 32))
}

export function stripBlocks (html: string, open: string, close: string, end: string, isElement: boolean): string {
    const lower = asciiLower(html)
    let result = ''
    let cursor = 0

    while (cursor < html.length) {
        let start = lower.indexOf(open, cursor)
        while (isElement && start !== -1 && /[a-z0-9]/.test(lower.charAt(start + open.length))) start = lower.indexOf(open, start + 1)
        if (start === -1) break

        result += html.slice(cursor, start)

        const closing = lower.indexOf(close, start + open.length)
        const stop = closing === -1 ? -1 : lower.indexOf(end, closing)
        cursor = stop === -1 ? html.length : stop + end.length
    }

    return result + html.slice(cursor)
}
