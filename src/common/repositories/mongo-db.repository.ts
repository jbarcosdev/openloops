import { ObjectId } from 'mongodb'
import { reportError } from '@common/error'
import { Document } from '@common/core/base.entity'
import { MongoClient, getMongoDBClient } from './mongo-db.client'

const DEFAULT_LIMIT = 10

export class MongoRepository<T> {
	private readonly database
	private readonly collection
	private readonly dbClient: MongoClient
	private readonly _where = { deletedAt: null, archivedAt: null }

	private readonly report = reportError

	constructor (props: { database: string; collection: string; envvar?: string }) {
		const { database, collection, envvar } = props || {}
		if (!database) throw new Error('[Mongo Repository] Database name is required')
		if (!collection) throw new Error('[Mongo Repository] Collection name is required')

		this.dbClient = getMongoDBClient(envvar)
		if (!this.dbClient) throw new Error('[Mongo Repository] Database client not found')

		this.database = database
		this.collection = collection
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

	public async findOne ({ where, select, options }: QueryParams<T>): Promise<T | null> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.findOne(
				{ ...where, ...this._where },
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

	public async findMany ({ where, select, options }: QueryParams<T>): Promise<T[]> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { page = 1, limit = 10 } = options || {}

			const _limit = this.clampLimit(limit)
			const _skip = +page > 0 ? (+page - 1) * _limit : 0

			const result = await collection
				.find({ ...where, ...this._where }, { projection: select })
				.sort(options?.sortBy || { _id: -1 })
				.skip(_skip)
				.limit(_limit)
				.toArray()

			return result as unknown as T[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async findAll ({ where, select }: QueryParams<T>): Promise<T[]> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.find({ ...where, ...this._where }, { projection: select }).toArray()
			return result as unknown as T[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async createOne ({ payload }: CommandParams<T>): Promise<ObjectId> {
		if (!payload || Object.keys(payload).length === 0) throw new Error('[Mongo Repository] Payload is required for createOne operation')

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { insertedId } = await collection.insertOne({ ...payload, __v: 1 })
			return insertedId
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async createMany ({ payload }: CommandParams<T>): Promise<CreateManyResponse> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { insertedIds } = await collection.insertMany(payload as any)
			return insertedIds
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async updateOne ({ where, payload, options }: CommandParams<T>): Promise<T> {
		if (!where || Object.keys(where).length === 0) throw new Error('[Mongo Repository] Where is required for updateOne operation')
		if (!payload || Object.keys(payload).length === 0) throw new Error('[Mongo Repository] Payload is required for updateOne operation')

		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { _id, __v, createdAt, createdBy, toUnset, ...toSet } = payload as Document

			const __payload = {
				...(toSet ? { $set: toSet } : {}),
				...(toUnset ? { $unset: toUnset } : {})
			}

			const result = await collection.findOneAndUpdate(
				{ ...where, ...this._where },
				{
					$inc: { __v: 1 },
					...__payload
				},
				{
					returnDocument: 'after',
				}
			)

			return result as unknown as T
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async updateMany ({ where, payload }: CommandParams<T>): Promise<number> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.updateMany(
				{ ...where, ...this._where },
				{ $set: payload }
			)
			const countUpdated = result.modifiedCount
			return countUpdated
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async deleteOne ({ where }: CommandParams<T>): Promise<number> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { deletedCount } = await collection.deleteOne({ ...where })
			return deletedCount
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async deleteMany ({ where }: CommandParams<T>): Promise<number> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const { deletedCount } = await collection.deleteMany({ ...where })
			return deletedCount
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async count ({ where, options }: QueryParams<T>): Promise<number> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.countDocuments({ ...where, ...( options?.includeDeleted ? {} : this._where) })
			return result
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async aggregate (pipeline: PipelineStage[]): Promise<T[]> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.aggregate(pipeline).toArray()
			return result as unknown as T[]
		} catch (error: any) {
			await this.report(error as Error)
			throw error
		}
	}

	public async distinct (field: string, where?: Record<string, unknown>): Promise<T[]> {
		try {
			const db = await this.dbClient.db(this.database)
			const collection = db.collection(this.collection)
			const result = await collection.distinct(field, { ...where, ...this._where })
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
	where?: Partial<T>
	payload?: Partial<T> | Partial<T>[]
	options?: Record<string, unknown>
}
