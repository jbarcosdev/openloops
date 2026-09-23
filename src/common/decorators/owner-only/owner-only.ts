const METADATA_KEY = "ownerOnly"

export function OwnerOnly (target: any, propertyKey: string) {
    Reflect.defineMetadata(METADATA_KEY, true, target, propertyKey)
}

const isOwnerOnly = (object, key) => Reflect.getMetadata(METADATA_KEY, object, key)

export function filterOwnerOnlyProperties(object: Record<string, any>): Record<string, any> {
    if (object && typeof object === 'object') {
        const newObject: Record<string, any> = {}
        for (const [key, value] of Object.entries(object)) {
            if (!isOwnerOnly(object, key)) {
                if (Array.isArray(value)) {
                    newObject[key] = value.map(item => filterOwnerOnlyProperties(item))
                } else if (typeof value === 'object') {
                    newObject[key] = filterOwnerOnlyProperties(value)
                } else {
                    newObject[key] = value
                }
            }
        }
        return newObject
    }
    return object
}
