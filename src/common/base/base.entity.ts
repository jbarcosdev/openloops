import { ObjectId } from 'bson'
import { HttpError } from '@common/error'
import { sanitizeString } from '@common/helpers'
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

    static toObjectId (id?: string | ObjectId): ObjectId | undefined {
        if (!id) return undefined
        if (id instanceof ObjectId) return id
        if (!ObjectId.isValid(id)) throw new HttpError({ statusCode: 400, errorMessage: '{{invalid_object_id}}', errorDetails: { id } })
        return new ObjectId(id)
    }

    static toText (value?: string): string | undefined {
        if (value === undefined || value === null) return undefined
        if (typeof value !== 'string') throw new HttpError({ statusCode: 400, errorMessage: '{{value_must_be_a_string}}' })
        return sanitizeString(value.trim()) || undefined
    }

    static toDate (value?: string | Date): Date | undefined {
        if (!value) return undefined
        const date = new Date(value)
        if (isNaN(date.getTime())) throw new HttpError({ statusCode: 400, errorMessage: '{{value_must_be_a_date}}' })
        return date
    }

    static toNumber (value?: number): number | undefined {
        if (value === undefined || value === null) return undefined
        if (typeof value !== 'number') throw new HttpError({ statusCode: 400, errorMessage: '{{value_must_be_a_number}}' })
        return value
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

    public toJSON (): BaseEntityProps {
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
        }
    }
}
