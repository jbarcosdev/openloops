import { ObjectId } from 'mongodb'
import type { BaseEntityProps } from '@common/base/base.entity'
import { reportError } from '@common/error'
import { MongoClient, getMongoDBClient } from './mongo-db.client'
import { Scope } from './scope'

const DEFAULT_LIMIT = 10

const PROTECTED_FIELDS = ['__v', 'ownerId', 'sharedWith', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt', 'deletedBy', 'archivedAt', 'archivedBy']

const IMMUTABLE_FIELDS = ['_id', '__v', 'createdAt', 'createdBy']

export class VersionConflictError extends Error {
	readonly code = 'VERSION_CONFLICT'
	readonly statusCode = 409

	constructor (message = '[Mongo Repository] The document was modified by someone else, reload and try again') {
		super(message)
		this.name = 'VersionConflictError'
	}
}

export class MongoRepository<T> {
	private readonly database
	private readonly collection
	private readonly dbClient: MongoClient
	private readonly _where = { deletedAt: null, archivedAt: null }
	private readonly scoped: boolean
	private readonly ownerField: string
	private readonly protectedFields: string[]

	private readonly report = reportError

	constructor (props: { database: string; collection: string; envvar?: string; scoped?: boolean; ownerField?: string; protectedFields?: string[] }) {
		const { database, collection, envvar, scoped = false, ownerField = 'ownerId', protectedFields = [] } = props || {}
		if (!database) throw new Error('[Mongo Repository] Database name is required')
		if (!collection) throw new Error('[Mongo Repository] Collection name is required')

		this.dbClient = getMongoDBClient(envvar)
		if (!this.dbClient) throw new Error('[Mongo Repository] Database client not found')

		this.database = database
		this.collection = collection
		this.scoped = scoped
		this.ownerField = ownerField
		this.protectedFields = [...PROTECTED_FIELDS, ...protectedFields]
	}

	private assertScope (scope?: Scope): void {
		if (!scope && this.scoped) throw new Error(`[Mongo Repository] Scope is required in ${this.collection}`)
	}

	private actorId (scope?: Scope): ObjectId | undefined {
		if (!scope || scope.kind === 'system') return undefined

		const userId = this.parseId(scope.userId)
		if (!userId) throw new Error('[Mongo Repository] Invalid user id in scope')

		return userId
	}

	private withScope (filter: Record<string, unknown>, scope?: Scope): Record<string, unknown> {
		this.assertScope(scope)
		if (!scope || scope.trusted) return filter

		return { $and: [filter, { [this.ownerField]: this.actorId(scope) }] }
	}

	private stampCreate (payload: Record<string, unknown>, scope?: Scope): Record<string, unknown> {
		this.assertScope(scope)
		if (!scope) return { ...payload }

		const actor = this.actorId(scope)
		return {
			...this.withoutProtected(payload, scope),
			...(scope.trusted || this.ownerField === '_id' ? {} : { [this.ownerField]: actor }),
			createdAt: new Date(),
			...(actor ? { createdBy: actor } : {}),
		}
	}

	private withoutProtected (payload: Record<string, unknown>, scope?: Scope): Record<string, unknown> {
		if (!scope || scope.trusted) return payload

		const kept = Object.fromEntries(Object.entries(payload).filter(([key]) => !this.protectedFields.includes(key)))

		return this.protectedFields.filter(path => path.includes('.')).reduce((result, path) => this.withoutPath(result, path.split('.')), kept)
	}

	private withoutPath (node: Record<string, unknown>, path: string[]): Record<string, unknown> {
		const [head, ...rest] = path
		if (!(head in node)) return node

		if (!rest.length) {
			const { [head]: removed, ...others } = node
			return others
		}

		const child = node[head]
		if (!child || typeof child !== 'object' || Array.isArray(child) || child instanceof Date || child instanceof ObjectId) return node

		const cleaned = this.withoutPath(child as Record<string, unknown>, rest)
		if (Object.keys(cleaned).length) return { ...node, [head]: cleaned }

		const { [head]: dropped, ...others } = node
		return others
	}

	public parseId (id: string | undefined): ObjectId | undefined {
		return typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : undefined
	}

	public cleanInput (value: string): string {
		return value?.replace(/[{}[\]()\/\\]/g, '')
	}

	private clampLimit (limit?: number): number {
		const n = Number(limit)
		return !Number.isFinite(n) || n <= 0 ? DEFAULT_LIMIT : n
	}

	public async findOne ({ where, select, options, scope }: QueryParams<T>): Promise<T | null> {
		const filter = this.withScope({ ...where, ...this._where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.findOne(
				filter,
				{
					...(select ? { projection: select } : {}),
					...options
				}
			)

			return result as unknown as T
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async findMany (params: QueryParams<T>): Promise<T[]> {
		const _limit = this.clampLimit(params.options?.limit)
		return this.query(params, _limit, _limit)
	}

	public async findManyPaginated (params: QueryParams<T>): Promise<{ items: T[], hasMore: boolean }> {
		const _limit = this.clampLimit(params.options?.limit)
		const results = await this.query(params, _limit, _limit + 1)
		return { items: results.slice(0, _limit), hasMore: results.length > _limit }
	}

	private async query ({ where, select, options, scope }: QueryParams<T>, pageSize: number, fetchSize: number): Promise<T[]> {
		const filter = this.withScope({ ...where, ...this._where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { page = 1 } = options || {}
			const _skip = +page > 0 ? (+page - 1) * pageSize : 0

			const result = await collection
				.find(filter, { projection: select })
				.sort(options?.sortBy || { _id: -1 })
				.skip(_skip)
				.limit(fetchSize)
				.toArray()

			return result as unknown as T[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async findAll ({ where, select, options, scope }: QueryParams<T>): Promise<T[]> {
		const filter = this.withScope({ ...where, ...this._where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const cursor = collection.find(filter, { projection: select })
			const result = await (options?.sortBy ? cursor.sort(options.sortBy) : cursor).toArray()
			return result as unknown as T[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async createOne ({ payload, scope }: CommandParams<T>): Promise<BaseEntityProps & { _id: ObjectId }> {
		if (!payload || Object.keys(payload).length === 0) throw new Error('[Mongo Repository] Payload is required for createOne operation')

		const document = this.stampCreate(payload as Record<string, unknown>, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { insertedId } = await collection.insertOne({ ...document, __v: 1 }, { ignoreUndefined: true })
			return { ...document, _id: insertedId, __v: 1 } as BaseEntityProps & { _id: ObjectId }
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async createMany ({ payload, scope }: CommandParams<T>): Promise<CreateManyResponse> {
		const documents = (payload as unknown as Record<string, unknown>[]).map(item => this.stampCreate(item, scope))

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { insertedIds } = await collection.insertMany(documents.map(document => ({ ...document, __v: 1 })) as any, { ignoreUndefined: true })
			return insertedIds
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async patchOne ({ where, set, unset, expectedVersion, scope }: PatchParams<T>): Promise<T | null> {
		return this.applyPatch({ where, set, unset, expectedVersion, scope })
	}

	public async archiveByPatch (params: PatchParams<T>): Promise<T | null> {
		const actor = this.actorId(params.scope)
		return this.applyPatch(params, { archivedAt: new Date(), ...(actor ? { archivedBy: actor } : {}) })
	}

	private async applyPatch ({ where, set, unset, expectedVersion, scope }: PatchParams<T>, stamps: Record<string, unknown> = {}): Promise<T | null> {
		if (!where || Object.keys(where).length === 0) throw new Error('[Mongo Repository] Where is required for patchOne operation')

		const actor = this.actorId(scope)
		const toSet = {
			...this.withoutProtectedPaths(set ?? {}, scope),
			...(scope ? { updatedAt: new Date(), ...(actor ? { updatedBy: actor } : {}) } : {}),
			...stamps,
		}
		const toUnset = this.withoutProtectedPaths(unset ?? {}, scope)

		return this.modifyOne(where, {
			$set: toSet,
			...(Object.keys(toUnset).length ? { $unset: toUnset } : {}),
		}, scope, expectedVersion)
	}

	public async claimOne ({ where, set, scope }: PatchParams<T>): Promise<T | null> {
		const filter = this.withScope({ ...where, ...this._where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.findOneAndUpdate(
				filter,
				{ $set: this.withoutProtectedPaths(set ?? {}, scope) },
				{ returnDocument: 'before', ignoreUndefined: true }
			)

			return result as unknown as T | null
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	private withoutProtectedPaths (fields: Record<string, unknown>, scope?: Scope): Record<string, unknown> {
		const guarded = scope && !scope.trusted
		const isProtected = (key: string) => this.protectedFields.some(field => key === field || key.startsWith(`${field}.`) || field.startsWith(`${key}.`))

		return Object.fromEntries(Object.entries(fields).filter(([key]) => !IMMUTABLE_FIELDS.includes(key) && !(guarded && isProtected(key))))
	}

	public async softDelete ({ where, payload, unset, scope }: CommandParams<T>): Promise<T | null> {
		if (!where || Object.keys(where).length === 0) throw new Error('[Mongo Repository] Where is required for softDelete operation')

		const actor = this.actorId(scope)
		const extra = this.withoutProtected((payload ?? {}) as Record<string, unknown>, scope)
		const toUnset = this.withoutProtectedPaths(unset ?? {}, scope)

		return this.modifyOne(where, {
			$set: { ...extra, deletedAt: new Date(), ...(actor ? { deletedBy: actor } : {}) },
			...(Object.keys(toUnset).length ? { $unset: toUnset } : {}),
		}, scope)
	}

	private async modifyOne (where: Partial<T>, update: Record<string, unknown>, scope?: Scope, expectedVersion?: number): Promise<T> {
		const checkVersion = typeof expectedVersion === 'number'
		const filter = this.withScope({ ...where, ...(checkVersion ? { __v: expectedVersion } : {}), ...this._where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.findOneAndUpdate(
				filter,
				{ $inc: { __v: 1 }, ...update },
				{ returnDocument: 'after', ignoreUndefined: true }
			)

			if (!result && checkVersion) {
				const exists = await collection.findOne(this.withScope({ ...where, ...this._where }, scope), { projection: { _id: 1 } })
				if (exists) throw new VersionConflictError()
			}

			return result as unknown as T
		} catch (error: any) {
			if (!(error instanceof VersionConflictError)) await this.report(error as Error)
			throw error
		}
	}

	public async updateMany ({ where, payload, scope }: CommandParams<T>): Promise<number> {
		const filter = this.withScope({ ...where, ...this._where }, scope)
		const actor = this.actorId(scope)
		const toSet = {
			...this.withoutProtected((payload ?? {}) as Record<string, unknown>, scope),
			...(scope ? { updatedAt: new Date(), ...(actor ? { updatedBy: actor } : {}) } : {}),
		}

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.updateMany(
				filter,
				{ $set: toSet }
			)
			const countUpdated = result.modifiedCount
			return countUpdated
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async deleteOne ({ where, scope }: CommandParams<T>): Promise<number> {
		const filter = this.withScope({ ...where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { deletedCount } = await collection.deleteOne(filter)
			return deletedCount
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async deleteMany ({ where, scope }: CommandParams<T>): Promise<number> {
		const filter = this.withScope({ ...where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { deletedCount } = await collection.deleteMany(filter)
			return deletedCount
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async count ({ where, options, scope }: QueryParams<T>): Promise<number> {
		const filter = this.withScope({ ...where, ...( options?.includeDeleted ? {} : this._where) }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.countDocuments(filter)
			return result
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async aggregate (pipeline: PipelineStage[], scope?: Scope): Promise<T[]> {
		const scopeFilter = this.withScope({}, scope)
		const scopedPipeline = Object.keys(scopeFilter).length ? [{ $match: scopeFilter }, ...pipeline] : pipeline

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.aggregate(scopedPipeline).toArray()
			return result as unknown as T[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async distinct (field: string, where?: Record<string, unknown>, scope?: Scope): Promise<T[]> {
		const filter = this.withScope({ ...where, ...this._where }, scope)

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.distinct(field, filter)
			return result as unknown as any[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}
}

export type PipelineStage =
	| { $addFields: Record<string, unknown> }
	| { $project: Record<string, unknown> }
	| { $lookup: Record<string, unknown> }
	| { $match: Record<string, unknown> }
	| { $facet: Record<string, unknown> }
	| { $group: Record<string, unknown> }
	| { $merge: Record<string, unknown> }
	| { $sort: Record<string, unknown> }
	| { $set: Record<string, unknown> }
	| { $sample: { size: number } }
	| { $unwind: string }
	| { $count: string }
	| { $limit: number }
	| { $skip: number }
	| { $out: string }

type CreateManyResponse = {
	[key: number]: ObjectId
}

export interface QueryParams<T> {
	scope?: Scope
	where?: Partial<T>
	select?: { [K in keyof T]?: 1 | 0 }
	options?: QueryOptions
}

export interface QueryOptions {
	page?: number
	limit?: number
	offset?: number
	sortBy?: { [key: string]: 1 | -1 }
	aggregate?: boolean
	includeDeleted?: boolean
}

export interface CommandParams<T> {
	scope?: Scope
	where?: Partial<T>
	payload?: Partial<T> | Partial<T>[]
	unset?: Record<string, unknown>
	options?: Record<string, unknown>
}

export interface PatchParams<T> {
	scope?: Scope
	where?: Partial<T>
	set?: Record<string, unknown>
	unset?: Record<string, unknown>
	expectedVersion?: number
}
