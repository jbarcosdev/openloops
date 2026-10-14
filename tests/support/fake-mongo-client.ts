import { ObjectId } from 'mongodb'

type Doc = Record<string, any>

function clone<T> (value: T): T {
    if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T
    if (value instanceof Date) return new Date(value.getTime()) as T
    if (Array.isArray(value)) return value.map(item => clone(item)) as T
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T
    return value
}

const comparable = (value: any): any => value instanceof Date ? value.getTime() : value instanceof ObjectId ? value.toHexString() : value

function isOperators (value: any): boolean {
    return Boolean(value) && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId) && Object.keys(value).length > 0 && Object.keys(value).every(key => key.startsWith('$'))
}

function matchesValue (actual: any, wanted: any): boolean {
    if (isOperators(wanted)) {
        return Object.entries(wanted).every(([operator, expected]: [string, any]) => {
            const present = actual !== undefined && actual !== null

            switch (operator) {
                case '$exists': return expected ? actual !== undefined : actual === undefined
                case '$ne': return comparable(actual) !== comparable(expected)
                case '$lte': return present && comparable(actual) <= comparable(expected)
                case '$lt': return present && comparable(actual) < comparable(expected)
                case '$gte': return present && comparable(actual) >= comparable(expected)
                case '$gt': return present && comparable(actual) > comparable(expected)
                case '$in': return (expected as any[]).some(item => String(comparable(item)) === String(comparable(actual)))
                default: throw new Error(`The fake mongo client does not support ${operator}`)
            }
        })
    }

    return wanted === null ? actual == null : String(comparable(actual)) === String(comparable(wanted))
}

function matches (doc: Doc, filter: Doc): boolean {
    return Object.entries(filter).every(([key, wanted]) => {
        if (key === '$or') return (wanted as Doc[]).some(branch => matches(doc, branch))
        return matchesValue(doc[key], wanted)
    })
}

function setPath (target: Doc, path: string, value: any): void {
    const parts = path.split('.')
    let cursor = target
    for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {}
    cursor[parts[parts.length - 1]] = value
}

function deletePath (target: Doc, path: string): void {
    const parts = path.split('.')
    let cursor: any = target
    for (const part of parts.slice(0, -1)) {
        cursor = cursor?.[part]
        if (!cursor || typeof cursor !== 'object') return
    }
    delete cursor[parts[parts.length - 1]]
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
            skip: (count: number) => {
                found = found.slice(count)
                return cursor
            },
            limit: (count: number) => {
                found = found.slice(0, count)
                return cursor
            },
            sort: (spec: Record<string, 1 | -1>) => {
                found = found.sort((a, b) => {
                    for (const [key, direction] of Object.entries(spec)) {
                        const left = comparable(a[key]) ?? ''
                        const right = comparable(b[key]) ?? ''
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

    async deleteOne (filter: Doc) {
        const index = this.docs.findIndex(doc => matches(doc, filter))
        if (index === -1) return { deletedCount: 0 }

        this.docs.splice(index, 1)
        return { deletedCount: 1 }
    }

    async findOneAndUpdate (filter: Doc, update: { $set?: Doc, $unset?: Doc, $inc?: Record<string, number> }) {
        this.beforeUpdate?.()

        const doc = this.docs.find(candidate => matches(candidate, filter))
        if (!doc) return null

        for (const [path, value] of Object.entries(update.$set ?? {})) setPath(doc, path, clone(value))
        for (const path of Object.keys(update.$unset ?? {})) deletePath(doc, path)
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
