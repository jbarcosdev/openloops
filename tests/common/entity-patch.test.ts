import { ObjectId } from 'mongodb'
import { BaseEntity } from '@common/base/base.entity'
import { entityPatch, toPatch } from '@common/base/utils'

describe('toPatch', () => {
    it('turns nested objects into paths, keeps arrays and dates whole and skips undefined', () => {
        const at = new Date(0)

        expect(toPatch({ name: 'a', state: { step: 1, deep: { flag: true } }, tags: ['x'], at, skipped: undefined })).toEqual({
            set: { name: 'a', 'state.step': 1, 'state.deep.flag': true, tags: ['x'], at },
            unset: {},
        })
    })

    it('unsets a null and a blank text', () => {
        expect(toPatch({ a: null, b: '  ', c: { d: null }, e: 'kept' })).toEqual({ set: { e: 'kept' }, unset: { a: '', b: '', 'c.d': '' } })
    })
})

describe('entityPatch', () => {
    const entity = (json: object, clearedFields?: Record<string, ''>) => ({ toJSON: () => json, clearedFields })

    it('adds the cleared fields of the entity to what the document has empty', () => {
        expect(entityPatch(entity({ a: 1, b: null }, { 'state.activeTaskId': '' }))).toEqual({ set: { a: 1 }, unset: { b: '', 'state.activeTaskId': '' } })
    })

    it('does not unset a path that the same save sets again', () => {
        expect(entityPatch(entity({ state: { activeTaskId: 'T2' } }, { 'state.activeTaskId': '' }))).toEqual({ set: { 'state.activeTaskId': 'T2' }, unset: {} })
    })
})

describe('BaseEntity values', () => {
    it('answers a 400 for an invalid id, date or number, and an undefined for a blank text', () => {
        expect(() => new BaseEntity({ _id: 'nope' })).toThrow(expect.objectContaining({ statusCode: 400 }))
        expect(() => new BaseEntity({ createdAt: 'yesterday' })).toThrow(expect.objectContaining({ statusCode: 400 }))
        expect(() => new BaseEntity({ __v: '1' as any })).toThrow(expect.objectContaining({ statusCode: 400 }))
        expect(BaseEntity.toText('   ')).toBeUndefined()
        expect(BaseEntity.toText(' ana ')).toBe('ana')
    })

    it('reads the ids as ObjectId and gives them back in the json', () => {
        const id = new ObjectId()
        const json = new BaseEntity({ _id: id.toString(), ownerId: id.toString() }).toJSON()

        expect(json._id).toEqual(id)
        expect(json.ownerId).toEqual(id)
    })
})
