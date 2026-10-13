import { ObjectId } from 'mongodb'

type Doc = Record<string, any>

function clone<T> (value: T): T {
    if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T
    if (value instanceof Date) return new Date(value.getTime()) as T
    if (Array.isArray(value)) return value.map(item => clone(item)) as T
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T
    return value
}

function matches (doc: Doc, filter: Doc): boolean {
    return Object.entries(filter).every(([key, wanted]) => wanted === null ? doc[key] == null : String(doc[key]) === String(wanted))
}

function setPath (target: Doc, path: string, value: any): void {
    const parts = path.split('.')
    let cursor = target
    for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {}
    cursor[parts[parts.length - 1]] = value
}

class FakeCollection {
    docs: Doc[] = []
    beforeUpdate?: () => void

    async insertOne (doc: Doc) {
        const stored = clone({ _id: new ObjectId(), ...doc })
        this.docs.push(stored)
        return { insertedId: stored._id }
    }

    async findOne (filter: Doc) {
        const found = this.docs.find(doc => matches(doc, filter))
        return found ? clone(found) : null
    }

    find (filter: Doc) {
        let found = this.docs.filter(doc => matches(doc, filter)).map(doc => clone(doc))
        const cursor = {
            sort: (spec: Record<string, 1 | -1>) => {
                found = found.sort((a, b) => {
                    for (const [key, direction] of Object.entries(spec)) {
                        const left = a[key] instanceof Date ? a[key].getTime() : String(a[key])
                        const right = b[key] instanceof Date ? b[key].getTime() : String(b[key])
                        if (left !== right) return (left < right ? -1 : 1) * direction
                    }
                    return 0
                })
                return cursor
            },
            toArray: async () => found,
        }
        return cursor
    }

    async findOneAndUpdate (filter: Doc, update: { $set?: Doc, $unset?: Doc, $inc?: Record<string, number> }) {
        this.beforeUpdate?.()

        const doc = this.docs.find(candidate => matches(candidate, filter))
        if (!doc) return null

        for (const [path, value] of Object.entries(update.$set ?? {})) setPath(doc, path, clone(value))
        for (const path of Object.keys(update.$unset ?? {})) delete doc[path]
        for (const [path, amount] of Object.entries(update.$inc ?? {})) doc[path] = (doc[path] ?? 0) + amount

        return clone(doc)
    }
}

class FakeMongoClient {
    private readonly collections = new Map<string, FakeCollection>()

    reset (): void {
        this.collections.clear()
    }

    collection (name: string): FakeCollection {
        if (!this.collections.has(name)) this.collections.set(name, new FakeCollection())
        return this.collections.get(name)!
    }

    async db () {
        return { collection: (name: string) => this.collection(name) }
    }
}

export const fakeMongo = new FakeMongoClient()
