import { isPlainObject } from './is-plain-object'

function safeClone (value: any): any {
    if (Array.isArray(value)) {
        return value.map(safeClone)
    }
    if (isPlainObject(value)) {
        const result: any = {}
        for (const key of Object.keys(value)) {
            result[key] = safeClone(value[key])
        }
        return result
    }

    return value
}

export function deleteEmptyFields (object) {
    const cleanObject = (obj: any) => {
        if (Array.isArray(obj)) {
            obj.forEach(cleanObject)
            return
        }
        if (!isPlainObject(obj)) return

        Object.keys(obj).forEach(key => {
            const value = obj[key]

            if (Array.isArray(value)) {
                cleanObject(value)
            } else if (isPlainObject(value)) {
                cleanObject(value)
                if (Object.keys(value).length === 0) {
                    delete obj[key]
                }
            } else if (value === undefined || value === null) {
                delete obj[key]
            }
        })
    }

    const clonedObject = safeClone(object)
    cleanObject(clonedObject)

    return clonedObject
}

