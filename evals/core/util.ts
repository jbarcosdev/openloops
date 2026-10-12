import type { AssistantMessage, Message } from '@earendil-works/pi-ai'

export function firstJson (text: string): any {
    for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
        let depth = 0
        let inString = false
        let escaped = false

        for (let index = start; index < text.length; index++) {
            const char = text[index]

            if (inString) {
                if (escaped) escaped = false
                else if (char === '\\') escaped = true
                else if (char === '"') inString = false
                continue
            }

            if (char === '"') inString = true
            else if (char === '{') depth++
            else if (char === '}' && --depth === 0) {
                try {
                    return JSON.parse(text.slice(start, index + 1))
                } catch {
                    break
                }
            }
        }
    }

    return undefined
}

export function parseJsonString (value: unknown) {
    if (typeof value !== 'string') return undefined
    try {
        return { value: JSON.parse(value), recovered: false }
    } catch {
        const recovered = firstJson(value)
        return recovered === undefined ? undefined : { value: recovered, recovered: true }
    }
}

export const toolCalls = (message: AssistantMessage) => message.content.filter((block: any) => block.type === 'toolCall') as any[]

export const textOf = (message: AssistantMessage) => message.content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('\n').trim()

export const userMessage = (content: string): Message => ({ role: 'user', content, timestamp: Date.now() })

export const toolResult = (call: any, text: string): Message => ({ role: 'toolResult', toolCallId: call.id, toolName: call.name, content: [{ type: 'text', text }], isError: false, timestamp: Date.now() })

export const usd = (value: number) => `$${value.toFixed(4)}`

export const seconds = (ms?: number) => ms === undefined ? '-' : `${(ms / 1000).toFixed(1)}s`

export const formatTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export const safeName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_')

export const stamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-').slice(0, 19)

export function limiter (max: number) {
    let active = 0
    const queue: Array<() => void> = []

    const next = () => {
        if (active >= max || !queue.length) return
        active++
        queue.shift()!()
    }

    return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
        queue.push(() => task().then(resolve, reject).finally(() => {
            active--
            next()
        }))
        next()
    })
}

export const average = (values: Array<number | undefined>) => {
    const known = values.filter((value): value is number => typeof value === 'number')
    return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : undefined
}
