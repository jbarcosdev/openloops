const METADATA_KEY = "adminOnly"

export function AdminOnly (target: any, propertyKey: string) {
    Reflect.defineMetadata(METADATA_KEY, true, target, propertyKey)
}

const isAdminOnly = (object, key) => Reflect.getMetadata(METADATA_KEY, object, key)

export function filterAdminOnlyProperties(object: Record<string, any>): Record<string, any> {
    if (object && typeof object === 'object') {
        const newObject: Record<string, any> = {}
        for (const [key, value] of Object.entries(object)) {
            if (!isAdminOnly(object, key)) {
                if (Array.isArray(value)) {
                    newObject[key] = value.map(item => filterAdminOnlyProperties(item))
                } else if (typeof value === 'object') {
                    newObject[key] = filterAdminOnlyProperties(value)
                } else {
                    newObject[key] = value
                }
            }
        }
        return newObject
    }
    return object
}
