import 'reflect-metadata'
import { ObjectId } from 'bson'
import { handleMaskInLogs } from '@common/decorators'
import { HttpError } from '@common/error'
import { sanitizeString } from '@common/helpers'
import { deleteEmptyFields, flattenObject } from './utils'
import { Share, ShareProps, createShares } from './share'

export interface BaseEntityProps {
    _id?: string | ObjectId
    __v?: number
    ownerId?: string | ObjectId
    createdAt?: string | Date
    createdBy?: string | ObjectId
    updatedAt?: string | Date
    updatedBy?: string | ObjectId
    deletedAt?: string | Date
    deletedBy?: string | ObjectId
    deletedReason?: string
    archivedAt?: string | Date
    archivedBy?: string | ObjectId
    sharedWith?: ShareProps[]
    toUnset?: Record<string, unknown>
}

export interface Document extends BaseEntityProps {
    toUnset?: Record<string, unknown>
}

export class BaseEntity {
    _id?: ObjectId

    __v?: number

    ownerId?: ObjectId

    createdAt?: Date

    createdBy?: ObjectId

    updatedAt?: Date

    updatedBy?: ObjectId

    deletedAt?: Date

    deletedBy?: ObjectId

    deletedReason?: string

    archivedAt?: Date

    archivedBy?: ObjectId

    sharedWith?: Share[]

    public toUnset?: Record<string, unknown>

    public static toObjectId (id?: string | ObjectId): ObjectId | undefined {
        if (!id) return undefined
        if (id instanceof ObjectId) return id
        if (!ObjectId.isValid(id)) throw new Error(`Invalid ObjectId: ${id}`)
        return new ObjectId(id)
    }

    public static toText (value?: string): string | undefined {
        if (value === undefined || value === null) return undefined
        if (typeof value !== 'string') throw new HttpError({ statusCode: 400, errorMessage: '{{value_must_be_a_string}}' })
        return sanitizeString(value.trim())
    }

    private static toDate (value?: string | Date): Date | undefined {
        if (!value) return undefined
        const date = new Date(value)
        if (isNaN(date.getTime())) throw new Error('{{value_must_be_a_date}}')
        return date
    }

    private static toNumber (value?: number): number | undefined {
        if (value === undefined || value === null) return undefined
        if (typeof value !== 'number') throw new Error('{{value_must_be_a_number}}')
        return value
    }

    public static clean (json) {
        return deleteEmptyFields(json)
    }

    constructor (props: BaseEntityProps) {
        this._id = BaseEntity.toObjectId(props._id)
        this.__v = BaseEntity.toNumber(props.__v)
        this.ownerId = BaseEntity.toObjectId(props.ownerId)
        this.createdAt = BaseEntity.toDate(props.createdAt)
        this.createdBy = BaseEntity.toObjectId(props.createdBy)
        this.updatedAt = BaseEntity.toDate(props.updatedAt)
        this.updatedBy = BaseEntity.toObjectId(props.updatedBy)
        this.deletedAt = BaseEntity.toDate(props.deletedAt)
        this.deletedBy = BaseEntity.toObjectId(props.deletedBy)
        this.deletedReason = BaseEntity.toText(props.deletedReason)
        this.archivedAt = BaseEntity.toDate(props.archivedAt)
        this.archivedBy = BaseEntity.toObjectId(props.archivedBy)
        this.sharedWith = createShares(props.sharedWith)
    }

    public toJSON (): Document {
        return {
            _id: this._id,
            __v: this.__v,
            ownerId: this.ownerId,
            createdAt: this.createdAt,
            createdBy: this.createdBy,
            updatedAt: this.updatedAt,
            updatedBy: this.updatedBy,
            deletedAt: this.deletedAt,
            deletedBy: this.deletedBy,
            deletedReason: this.deletedReason,
            archivedAt: this.archivedAt,
            archivedBy: this.archivedBy,
            sharedWith: this.sharedWith?.length ? this.sharedWith : undefined,
            toUnset: this.toUnset,
        }
    }

    public setDefaults (): void {
        // To set default values in your child classes
    }

    public setId (id: string | ObjectId): void {
        this._id = BaseEntity.toObjectId(id)
    }

    public toDocument (): Document {
        return deleteEmptyFields(this.toJSON())
    }

    public toFlatDocument (): Document {
        const { toUnset, ...doc } = this.toDocument()
        return { ...flattenObject(doc), toUnset }
    }

    public stringify () {
        return JSON.stringify(handleMaskInLogs(this), null, 2)
    }

    public unset (fields: (keyof this)[]) {
        const toUnset = Array.from(new Set(fields.map(field => String(field))))

        if (!toUnset || !Array.isArray(toUnset)) return {}

        this.toUnset = toUnset.reduce((acc, field) => {
            acc[field] = ''
            return acc
        }, {})

        fields.forEach(field => {
            delete this[field]
        })
    }

}
