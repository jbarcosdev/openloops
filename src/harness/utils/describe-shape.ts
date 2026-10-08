const MAX_KEYS = 20

export function describeShape (value: any, depth = 2): any {
    if (Array.isArray(value)) {
        return {
            type: 'array',
            length: value.length,
            ...(value.length && depth > 0 ? { item: describeShape(value[0], depth - 1) } : {}),
        }
    }

    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value)

        if (depth <= 0) return { type: 'object', keys: keys.slice(0, MAX_KEYS) }

        const shape: Record<string, any> = {}
        for (const key of keys.slice(0, MAX_KEYS)) shape[key] = describeShape(value[key], depth - 1)
        if (keys.length > MAX_KEYS) shape['...'] = `${keys.length - MAX_KEYS} more keys`

        return shape
    }

    if (typeof value === 'string' && value.length > 80) return `string(${value.length})`

    return value === null ? 'null' : typeof value
}

export function describeShapeWithin (value: any, maxChars = 1200): any {
    for (const depth of [3, 2, 1, 0]) {
        const shape = describeShape(value, depth)
        if (JSON.stringify(shape).length <= maxChars) return shape
    }

    return describeShape(value, 0)
}
