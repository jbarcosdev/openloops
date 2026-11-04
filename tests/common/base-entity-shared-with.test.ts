import { ObjectId } from 'mongodb'
import { BaseEntity } from '@common/base/base.entity'

const USER = new ObjectId().toString()
const OTHER = new ObjectId().toString()

describe('BaseEntity sharedWith', () => {
    it('stores the user as an ObjectId next to its permission', () => {
        const entity = new BaseEntity({ sharedWith: [{ userId: OTHER, permission: 'write' }] })

        expect(entity.sharedWith).toEqual([{ userId: new ObjectId(OTHER), permission: 'write' }])
        expect(entity.toDocument().sharedWith).toEqual([{ userId: new ObjectId(OTHER), permission: 'write' }])
    })

    it('has no sharedWith when nobody is listed', () => {
        expect(new BaseEntity({}).sharedWith).toBeUndefined()
        expect(new BaseEntity({ sharedWith: [] }).toDocument().sharedWith).toBeUndefined()
    })

    it('rejects an unknown permission and an invalid user id', () => {
        expect(() => new BaseEntity({ sharedWith: [{ userId: OTHER, permission: 'owner' as any }] })).toThrow('Invalid permission')
        expect(() => new BaseEntity({ sharedWith: [{ userId: 'nope', permission: 'read' }] })).toThrow()
    })

    it('keeps one entry per user with the highest permission', () => {
        const entity = new BaseEntity({ sharedWith: [
            { userId: OTHER, permission: 'manage' },
            { userId: OTHER, permission: 'read' },
            { userId: USER, permission: 'read' },
        ] })

        expect(entity.sharedWith).toEqual([
            { userId: new ObjectId(OTHER), permission: 'manage' },
            { userId: new ObjectId(USER), permission: 'read' },
        ])
    })
})
