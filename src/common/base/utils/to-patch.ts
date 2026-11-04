import { isPlainObject } from './is-plain-object'

export interface Patch {
    set: Record<string, unknown>
    unset: Record<string, unknown>
}

export function toPatch (obj: unknown, parentKey = '', patch: Patch = { set: {}, unset: {} }): Patch {
    if (!isPlainObject(obj)) return patch

    for (const [key, value] of Object.entries(obj as object)) {
        const path = parentKey ? `${parentKey}.${key}` : key

        if (value === undefined) continue
        if (value === null || (typeof value === 'string' && !value.trim())) patch.unset[path] = ''
        else if (isPlainObject(value)) toPatch(value, path, patch)
        else patch.set[path] = value
    }

    return patch
}

export function entityPatch (entity: { toJSON (): unknown, clearedFields?: Record<string, ''> }): Patch {
    const patch = toPatch(entity.toJSON())
    const unset = Object.fromEntries(Object.entries({ ...patch.unset, ...entity.clearedFields }).filter(([path]) => !(path in patch.set)))

    return { set: patch.set, unset }
}
