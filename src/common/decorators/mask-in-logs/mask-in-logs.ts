import { isPlainObject } from "@common/base/utils"

const METADATA_KEY = "maskInLogs"

export function MaskInLogs (target: any, propertyKey: string) {
    Reflect.defineMetadata(METADATA_KEY, true, target, propertyKey)
}

const shouldMaskInLogs = (object, key) => Reflect.getMetadata(METADATA_KEY, object, key)

export function handleMaskInLogs(object: Record<string, any>): Record<string, any> {
    if (object && isPlainObject(object)) {
        const newObject: Record<string, any> = {}
        for (const [key, value] of Object.entries(object)) {
            if (shouldMaskInLogs(object, key)) {
                newObject[key] = '[HIDDEN]'
            } else if (Array.isArray(value)) {
                newObject[key] = value.map(item => handleMaskInLogs(item))
            } else if (typeof value === 'object') {
                newObject[key] = handleMaskInLogs(value)
            } else {
                newObject[key] = value
            }
        }
        return newObject
    }
    return object
}
