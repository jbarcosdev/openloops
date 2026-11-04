import { ObjectId } from 'mongodb'
import { ChatRepository } from '@services/chats/repositories'
import { AgentTaskRepository, AgentActionRepository } from '@services/tasks/repositories'
import { WorkspaceItemRepository } from '@services/workspaces/repositories'
import { AgentTraceRepository } from '@services/traces/repositories'

type Doc = Record<string, any>

function provide (repository: { prototype: object }, methods: Record<string, (...args: any[]) => unknown>): void {
    for (const [name, implementation] of Object.entries(methods)) {
        jest.spyOn(repository.prototype as any, name).mockImplementation(implementation as any)
    }
}

const PROTECTED = ['__v', 'ownerId', 'sharedWith', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt', 'deletedBy', 'archivedAt', 'archivedBy']

function actorOf (scope: any): ObjectId | undefined {
    return scope?.kind !== 'system' && scope?.userId ? new ObjectId(scope.userId) : undefined
}

function stampCreate (doc: Doc, scope: any): Doc {
    if (!scope) return doc

    const actor = actorOf(scope)
    const base = scope.trusted ? doc : Object.fromEntries(Object.entries(doc).filter(([key]) => !PROTECTED.includes(key)))
    return { ...base, ...(scope.trusted ? {} : { ownerId: actor }), createdAt: new Date(), ...(actor ? { createdBy: actor } : {}) }
}

function stampUpdate (doc: Doc, scope: any): Doc {
    if (!scope) return doc

    const actor = actorOf(scope)
    const base = scope.trusted ? doc : Object.fromEntries(Object.entries(doc).filter(([key]) => !PROTECTED.includes(key)))
    return { ...base, updatedAt: new Date(), ...(actor ? { updatedBy: actor } : {}) }
}

function clone<T> (value: T): T {
    if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T
    if (value instanceof Date) return new Date(value.getTime()) as T
    if (Array.isArray(value)) return value.map(item => clone(item)) as T
    if (value && typeof value === 'object') {
        const out: Doc = {}
        for (const [key, item] of Object.entries(value)) out[key] = clone(item)
        return out as T
    }
    return value
}

function same (left: any, right: any): boolean {
    if (left instanceof ObjectId || right instanceof ObjectId) return String(left) === String(right)
    return left === right
}

function setPath (target: Doc, path: string, value: any): void {
    const parts = path.split('.')
    let cursor = target
    parts.slice(0, -1).forEach((part, index) => {
        if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = /^\d+$/.test(parts[index + 1]) ? [] : {}
        cursor = cursor[part]
    })
    cursor[parts[parts.length - 1]] = value
}

function isPlain (value: unknown): value is Doc {
    return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

function unsetPath (target: Doc, path: string): void {
    const parts = path.split('.')
    let node: any = target
    for (const part of parts.slice(0, -1)) {
        node = node?.[part]
        if (node === undefined || node === null) return
    }
    delete node[parts[parts.length - 1]]
}

function mergeDeep (target: Doc, source: Doc): void {
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) continue
        if (isPlain(value) && isPlain(target[key])) mergeDeep(target[key], value)
        else target[key] = clone(value)
    }
}

function matches (doc: Doc, where: Doc): boolean {
    return Object.entries(where).every(([key, expected]) => {
        if (key === '$or') return (expected as Doc[]).some(branch => matches(doc, branch))
        if (expected === undefined) return true
        const actual = doc[key]
        if (expected && typeof expected === 'object' && '$regex' in expected) {
            return new RegExp(expected.$regex, expected.$options).test(String(actual ?? ''))
        }
        if (expected === null) return actual === undefined || actual === null
        return same(actual, expected)
    })
}

function project (doc: Doc, select?: Doc): Doc {
    if (!select) return clone(doc)
    const entries = Object.entries(select)
    const excluding = entries.every(([, flag]) => flag === 0)
    const out: Doc = {}
    for (const [key, value] of Object.entries(doc)) {
        const listed = entries.some(([field]) => field === key)
        if (excluding ? !listed : listed || key === '_id') out[key] = clone(value)
    }
    return out
}

export class MemoryCollection {
    private readonly docs = new Map<string, Doc>()
    writes = 0

    clear (): void {
        this.docs.clear()
        this.writes = 0
    }

    all (): Doc[] {
        return [...this.docs.values()].map(doc => clone(doc))
    }

    insert (doc: Doc): ObjectId {
        const id = doc._id ? new ObjectId(String(doc._id)) : new ObjectId()
        this.docs.set(id.toHexString(), clone({ ...doc, _id: id }))
        return id
    }

    patch (id: ObjectId | string | undefined, doc: Doc, unset: string[] = [], options: { merge?: boolean } = {}): Doc | null {
        const current = id ? this.docs.get(String(id)) : undefined
        if (!current) return null

        this.writes++

        for (const [key, value] of Object.entries(doc)) {
            if (key === 'toUnset' || key === '_id' || value === undefined) continue
            if (key.includes('.')) setPath(current, key, clone(value))
            else if (options.merge && isPlain(value) && isPlain(current[key])) mergeDeep(current[key], value)
            else current[key] = clone(value)
        }

        for (const key of unset) unsetPath(current, key)

        return clone(current)
    }

    findById (id: string | ObjectId | undefined, select?: Doc): Doc | null {
        const hit = id ? this.docs.get(String(id)) : undefined
        return hit ? project(hit, select) : null
    }

    find (where: Doc, select?: Doc, options?: Doc): Doc[] {
        let rows = [...this.docs.values()].filter(doc => matches(doc, where))
        const sortBy = options?.sortBy as Record<string, number> | undefined
        if (sortBy) {
            const [field, direction] = Object.entries(sortBy)[0] ?? []
            if (field) {
                rows = rows.sort((a, b) => {
                    const left = String(a[field] ?? '')
                    const right = String(b[field] ?? '')
                    return (left < right ? -1 : left > right ? 1 : 0) * (direction as number)
                })
            }
        }
        if (options?.limit) rows = rows.slice(0, options.limit)
        return rows.map(doc => project(doc, select))
    }

    remove (id: string | ObjectId | undefined): number {
        return id && this.docs.delete(String(id)) ? 1 : 0
    }
}

export class MemoryDb {
    readonly chats = new MemoryCollection()
    readonly tasks = new MemoryCollection()
    readonly actions = new MemoryCollection()
    readonly workspace = new MemoryCollection()
    readonly traces = new MemoryCollection()

    reset (): void {
        this.chats.clear()
        this.tasks.clear()
        this.actions.clear()
        this.workspace.clear()
        this.traces.clear()
    }

    install (): this {
        const db = this

        provide(ChatRepository, {
            async create (chat: any, scope: any) {
                chat.setId(db.chats.insert(stampCreate(chat.toDocument(), scope)))
                return chat
            },
            async update (chat: any, scope: any) {
                const json = stampUpdate(chat.toJSON(), scope)
                return db.chats.patch(chat._id, json, Object.keys(chat.toJSON().toUnset ?? {}), { merge: true })
            },
            async findById (id: string, _scope: any, select?: Doc) {
                return db.chats.findById(id, select)
            },
            async deleteById (id: string, _scope: any) {
                return db.chats.remove(id)
            },
            async findByProps (where: Doc, options: Doc, _scope: any) {
                return { items: db.chats.find(where, undefined, options), hasMore: false }
            },
        })

        provide(AgentTaskRepository, {
            async create (task: any, scope: any) {
                task.setId(db.tasks.insert(stampCreate(task.toDocument(), scope)))
                return task
            },
            async update (task: any, scope: any) {
                return db.tasks.patch(task._id, stampUpdate(task.toDocument(), scope), Object.keys(task.clearedFields))
            },
            async findById (id: string, _scope: any, select?: Doc) {
                return db.tasks.findById(id, select)
            },
            async findByProps (where: Doc, options: Doc, _scope: any) {
                return { items: db.tasks.find(where, undefined, options), hasMore: false }
            },
        })

        provide(AgentActionRepository, {
            async create (action: any, scope: any) {
                action.setId(db.actions.insert(stampCreate(action.toDocument(), scope)))
                return action
            },
            async update (action: any, scope: any) {
                return db.actions.patch(action._id, stampUpdate(action.toDocument(), scope), Object.keys(action.clearedFields))
            },
            async findByProps (where: Doc, options: Doc, _scope: any) {
                return { items: db.actions.find(where, undefined, options), hasMore: false }
            },
        })

        provide(WorkspaceItemRepository, {
            async create (item: any, scope: any) {
                item.setId(db.workspace.insert(stampCreate(item.toDocument(), scope)))
                return item
            },
            async update (item: any, scope: any) {
                return db.workspace.patch(item._id, stampUpdate(item.toDocument(), scope))
            },
            async findById (id: string, _scope: any, select?: Doc) {
                return db.workspace.findById(id, select)
            },
            async findByName (lookup: Doc, _scope: any, select?: Doc) {
                const { ownerId, chatId, taskId, name } = lookup
                const rows = db.workspace.find({ ...(ownerId ? { ownerId } : {}), chatId, taskId: taskId ?? null, name }, select)
                return rows[0] ?? null
            },
            async findMany (where: Doc, _scope: any, select?: Doc, options?: Doc) {
                return db.workspace.find(where, select, options)
            },
            async findManyPaginated (where: Doc, _scope: any, select?: Doc, options?: Doc) {
                return { items: db.workspace.find(where, select, options), hasMore: false }
            },
            async deleteById (id: string, _scope: any) {
                return db.workspace.remove(id)
            },
        })

        provide(AgentTraceRepository, {
            async createMany (entries: any[], scope: any) {
                entries.forEach(entry => db.traces.insert(stampCreate(entry.toDocument(), scope)))
                return entries.length
            },
            async findByProps (where: Doc, options: Doc, _scope: any) {
                return { items: db.traces.find(where, undefined, options), hasMore: false }
            },
        })

        return this
    }
}
