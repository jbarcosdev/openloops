import { isPlainObject } from './is-plain-object'

export function flattenObject (obj, parentKey = "", result = {}) {
    if (!isPlainObject(obj)) {
        return {}
    }

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            const newKey = parentKey ? `${parentKey}.${key}` : key
            const value = obj[key]

            if (isPlainObject(value)) {
                flattenObject(value, newKey, result)
            } else {
                result[newKey] = value
            }
        }
    }
    return result as any
}
