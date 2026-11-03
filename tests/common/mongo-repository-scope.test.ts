import { ObjectId } from 'mongodb'

const findOne = jest.fn()
const findOneAndUpdate = jest.fn()
const insertOne = jest.fn()
const insertMany = jest.fn()
const deleteOne = jest.fn()
const updateMany = jest.fn()
const countDocuments = jest.fn()
const aggregateToArray = jest.fn()
const aggregate = jest.fn((_pipeline: unknown[]) => ({ toArray: aggregateToArray }))

jest.mock('@common/repositories/mongo-db.client', () => ({
    getMongoDBClient: () => ({
        db: async () => ({
            collection: () => ({ findOne, findOneAndUpdate, insertOne, insertMany, deleteOne, updateMany, countDocuments, aggregate }),
        }),
    }),
}))

import { MongoRepository, VersionConflictError } from '@common/repositories/mongo-db.repository'
import { Scope } from '@common/repositories/scope'

const USER = new ObjectId().toString()
const OTHER = new ObjectId().toString()
const DOC_ID = new ObjectId()

const user = (userId = USER, admin = false) => ({ userId, isAdmin: () => admin })
const scopedRepo = () => new MongoRepository<any>({ database: 'app', collection: 'things', scoped: true })

const clientPayload = () => ({
    name: 'coffee',
    ownerId: new ObjectId(OTHER),
    sharedWith: [{ userId: new ObjectId(OTHER), permission: 'manage' }],
    createdBy: new ObjectId(OTHER),
    updatedBy: new ObjectId(OTHER),
    deletedAt: new Date(0),
    deletedBy: new ObjectId(OTHER),
    archivedAt: new Date(0),
    archivedBy: new ObjectId(OTHER),
})

describe('Scope', () => {
    it.each(['canView', 'canEdit', 'canManage'] as const)('%s needs an authenticated user', (intent) => {
        expect(Scope[intent](user()).userId).toBe(USER)
        expect(() => Scope[intent](undefined)).toThrow()
        expect(() => Scope[intent]({ userId: undefined, isAdmin: () => false })).toThrow()
    })

    it('does not escalate an admin on the user intents, and only an admin can use asAdmin', () => {
        expect(Scope.canView(user(USER, true)).kind).toBe('view')
        expect(Scope.canEdit(user(USER, true)).kind).toBe('edit')
        expect(Scope.canManage(user(USER, true)).kind).toBe('manage')
        expect(Scope.asAdmin(user(USER, true)).kind).toBe('admin')
        expect(() => Scope.asAdmin(user())).toThrow()
        expect(() => Scope.asAdmin(undefined)).toThrow()
    })

    it('requires a reason for a system scope', () => {
        expect(Scope.system('worker').reason).toBe('worker')
        expect(() => Scope.system('')).toThrow('reason is required')
        expect(() => Scope.system('  ')).toThrow('reason is required')
    })
})

describe('MongoRepository scope', () => {
    beforeEach(() => {
        findOne.mockReset()
        findOneAndUpdate.mockReset().mockResolvedValue({ _id: DOC_ID })
        insertOne.mockReset().mockResolvedValue({ insertedId: DOC_ID })
        insertMany.mockReset().mockResolvedValue({ insertedIds: { 0: DOC_ID } })
        deleteOne.mockReset().mockResolvedValue({ deletedCount: 0 })
        updateMany.mockReset().mockResolvedValue({ modifiedCount: 0 })
        countDocuments.mockReset().mockResolvedValue(0)
        aggregate.mockClear()
        aggregateToArray.mockReset().mockResolvedValue([])
    })

    it('adds the owner condition next to the soft delete filter', async () => {
        await scopedRepo().findOne({ where: { _id: DOC_ID }, scope: Scope.canView(user()) })

        expect(findOne.mock.calls[0][0]).toEqual({
            $and: [
                { _id: DOC_ID, deletedAt: null, archivedAt: null },
                { ownerId: new ObjectId(USER) },
            ],
        })
    })

    it('keeps the owner condition even if the caller filters by another owner', async () => {
        const other = new ObjectId()
        await scopedRepo().findOne({ where: { ownerId: other }, scope: Scope.canView(user()) })

        const [base, owner] = findOne.mock.calls[0][0].$and
        expect(base.ownerId).toEqual(other)
        expect(owner).toEqual({ ownerId: new ObjectId(USER) })
    })

    it.each(['canView', 'canEdit', 'canManage'] as const)('%s only reaches the documents of the owner while nothing is shared', async (intent) => {
        await scopedRepo().findOne({ where: {}, scope: Scope[intent](user()) })

        expect(findOne.mock.calls[0][0].$and[1]).toEqual({ ownerId: new ObjectId(USER) })
    })

    it('does not add conditions when the scope is trusted', async () => {
        await scopedRepo().findOne({ where: { _id: DOC_ID }, scope: Scope.system('test') })

        expect(findOne.mock.calls[0][0]).toEqual({ _id: DOC_ID, deletedAt: null, archivedAt: null })
    })

    it('uses the configured owner field', async () => {
        const repo = new MongoRepository<any>({ database: 'app', collection: 'users', scoped: true, ownerField: '_id' })
        await repo.findOne({ where: {}, scope: Scope.canView(user()) })

        expect(findOne.mock.calls[0][0].$and[1]).toEqual({ _id: new ObjectId(USER) })
    })

    it('fails closed when a scoped repository is used without scope', async () => {
        const repo = scopedRepo()

        await expect(repo.findOne({ where: {} })).rejects.toThrow('Scope is required')
        await expect(repo.findMany({ where: {} })).rejects.toThrow('Scope is required')
        await expect(repo.findAll({ where: {} })).rejects.toThrow('Scope is required')
        await expect(repo.createOne({ payload: { a: 1 } })).rejects.toThrow('Scope is required')
        await expect(repo.createMany({ payload: [{ a: 1 }] })).rejects.toThrow('Scope is required')
        await expect(repo.updateOne({ where: { _id: DOC_ID }, payload: { a: 1 } })).rejects.toThrow('Scope is required')
        await expect(repo.updateMany({ where: {}, payload: { a: 1 } })).rejects.toThrow('Scope is required')
        await expect(repo.softDelete({ where: { _id: DOC_ID } })).rejects.toThrow('Scope is required')
        await expect(repo.deleteOne({ where: { _id: DOC_ID } })).rejects.toThrow('Scope is required')
        await expect(repo.deleteMany({ where: {} })).rejects.toThrow('Scope is required')
        await expect(repo.count({ where: {} })).rejects.toThrow('Scope is required')
        await expect(repo.aggregate([])).rejects.toThrow('Scope is required')
        await expect(repo.distinct('a')).rejects.toThrow('Scope is required')
        expect(findOne).not.toHaveBeenCalled()
        expect(insertOne).not.toHaveBeenCalled()
    })

    it('rejects an invalid user id in the scope', async () => {
        await expect(scopedRepo().findOne({ where: {}, scope: Scope.canView(user('nope')) })).rejects.toThrow('Invalid user id')
    })

    it('does not require scope in a repository that is not scoped, but applies it when given', async () => {
        const repo = new MongoRepository<any>({ database: 'app', collection: 'things' })

        await repo.findOne({ where: { _id: DOC_ID } })
        expect(findOne.mock.calls[0][0]).toEqual({ _id: DOC_ID, deletedAt: null, archivedAt: null })

        await repo.findOne({ where: { _id: DOC_ID }, scope: Scope.canView(user()) })
        expect(findOne.mock.calls[1][0].$and[1]).toEqual({ ownerId: new ObjectId(USER) })
    })

    it('deletes, counts and aggregates only the documents of the owner', async () => {
        await scopedRepo().deleteOne({ where: { _id: DOC_ID }, scope: Scope.canManage(user()) })
        await scopedRepo().count({ where: {}, scope: Scope.canView(user()) })
        await scopedRepo().aggregate([{ $group: { _id: null } }], Scope.canView(user()))
        await scopedRepo().aggregate([{ $group: { _id: null } }], Scope.system('test'))

        expect(deleteOne.mock.calls[0][0]).toEqual({ $and: [{ _id: DOC_ID }, { ownerId: new ObjectId(USER) }] })
        expect(countDocuments.mock.calls[0][0].$and[1]).toEqual({ ownerId: new ObjectId(USER) })
        expect(aggregate.mock.calls[0][0]).toEqual([{ $match: { $and: [{}, { ownerId: new ObjectId(USER) }] } }, { $group: { _id: null } }])
        expect(aggregate.mock.calls[1][0]).toEqual([{ $group: { _id: null } }])
    })

    it('checks the version inside the scope, so a document of another user is not found instead of in conflict', async () => {
        findOneAndUpdate.mockResolvedValue(null)
        findOne.mockResolvedValue(null)

        const result = await scopedRepo().updateOne({ where: { _id: DOC_ID }, payload: { a: 1 }, expectedVersion: 3, scope: Scope.canEdit(user()) })

        expect(result).toBeNull()
        expect(findOneAndUpdate.mock.calls[0][0].$and[0]).toMatchObject({ __v: 3 })
        expect(findOneAndUpdate.mock.calls[0][0].$and[1]).toEqual({ ownerId: new ObjectId(USER) })
        expect(findOne.mock.calls[0][0].$and[1]).toEqual({ ownerId: new ObjectId(USER) })
    })

    it('still reports a version conflict to the owner', async () => {
        findOneAndUpdate.mockResolvedValue(null)
        findOne.mockResolvedValue({ _id: DOC_ID })

        await expect(scopedRepo().updateOne({ where: { _id: DOC_ID }, payload: { a: 1 }, expectedVersion: 3, scope: Scope.canEdit(user()) })).rejects.toBeInstanceOf(VersionConflictError)
    })
})

describe('MongoRepository stamps', () => {
    beforeEach(() => {
        insertOne.mockReset().mockResolvedValue({ insertedId: DOC_ID })
        insertMany.mockReset().mockResolvedValue({ insertedIds: { 0: DOC_ID } })
        findOneAndUpdate.mockReset().mockResolvedValue({ _id: DOC_ID })
        updateMany.mockReset().mockResolvedValue({ modifiedCount: 1 })
    })

    it('drops the control fields of the client and stamps the owner and the audit fields on create', async () => {
        const stored = await scopedRepo().createOne({ payload: clientPayload(), scope: Scope.canEdit(user()) })

        const inserted = insertOne.mock.calls[0][0]
        expect(inserted.name).toBe('coffee')
        expect(inserted.ownerId).toEqual(new ObjectId(USER))
        expect(inserted.createdBy).toEqual(new ObjectId(USER))
        expect(inserted.createdAt).toBeInstanceOf(Date)
        expect(inserted.__v).toBe(1)
        for (const field of ['sharedWith', 'updatedBy', 'deletedAt', 'deletedBy', 'archivedAt', 'archivedBy']) {
            expect(inserted[field]).toBeUndefined()
        }
        expect(stored).toMatchObject({ _id: DOC_ID, ownerId: new ObjectId(USER), createdBy: new ObjectId(USER) })
    })

    it('does not add an owner in the collection where the document is its own owner', async () => {
        const repo = new MongoRepository<any>({ database: 'app', collection: 'users', scoped: true, ownerField: '_id' })
        await repo.createOne({ payload: { name: 'sofi' }, scope: Scope.canEdit(user()) })

        expect(insertOne.mock.calls[0][0].ownerId).toBeUndefined()
        expect(insertOne.mock.calls[0][0].createdBy).toEqual(new ObjectId(USER))
    })

    it('also drops the fields the collection protects, unless the scope is trusted', async () => {
        const repo = new MongoRepository<any>({ database: 'app', collection: 'users', scoped: true, ownerField: '_id', protectedFields: ['role'] })
        await repo.createOne({ payload: { name: 'sofi', role: 'ADMIN' }, scope: Scope.canEdit(user()) })
        await repo.createOne({ payload: { name: 'sofi', role: 'ADMIN' }, scope: Scope.system('test') })

        expect(insertOne.mock.calls[0][0].role).toBeUndefined()
        expect(insertOne.mock.calls[1][0].role).toBe('ADMIN')
    })

    it('also drops a protected field inside an object, on create and on a flat update, and the object when it ends up empty', async () => {
        const repo = new MongoRepository<any>({ database: 'app', collection: 'users', scoped: true, ownerField: '_id', protectedFields: ['marketing.drawNumber', 'acquisition.referrerCode'] })
        const payload = { name: 'sofi', marketing: { drawNumber: '1234' }, acquisition: { platform: 'ios', referrerCode: 'abc' } }

        await repo.createOne({ payload: payload as any, scope: Scope.canEdit(user()) })
        await repo.createOne({ payload: payload as any, scope: Scope.system('test') })
        await repo.updateOne({ where: { _id: DOC_ID }, payload: { 'marketing.drawNumber': '1234', 'acquisition.referrerCode': 'abc', 'acquisition.platform': 'ios' } as any, scope: Scope.canEdit(user()) })

        const [byUser, bySystem] = insertOne.mock.calls.map(call => call[0])
        expect(byUser.marketing).toBeUndefined()
        expect(byUser.acquisition).toEqual({ platform: 'ios' })
        expect(bySystem.marketing).toEqual({ drawNumber: '1234' })
        expect(bySystem.acquisition).toEqual({ platform: 'ios', referrerCode: 'abc' })

        const { $set } = findOneAndUpdate.mock.calls[0][1]
        expect($set['marketing.drawNumber']).toBeUndefined()
        expect($set['acquisition.referrerCode']).toBeUndefined()
        expect($set['acquisition.platform']).toBe('ios')
    })

    it('keeps the owner of the payload when the scope is trusted', async () => {
        await scopedRepo().createOne({ payload: clientPayload(), scope: Scope.asAdmin(user(USER, true)) })
        await scopedRepo().createOne({ payload: clientPayload(), scope: Scope.system('test') })

        const [asAdmin, asSystem] = insertOne.mock.calls.map(call => call[0])
        expect(asAdmin.ownerId).toEqual(new ObjectId(OTHER))
        expect(asAdmin.createdBy).toEqual(new ObjectId(USER))
        expect(asSystem.ownerId).toEqual(new ObjectId(OTHER))
        expect(asSystem.createdAt).toBeInstanceOf(Date)
        expect(asSystem.createdBy).toEqual(new ObjectId(OTHER))
    })

    it('stamps every document of a createMany', async () => {
        await scopedRepo().createMany({ payload: [clientPayload(), clientPayload()] as any, scope: Scope.canEdit(user()) })

        const docs = insertMany.mock.calls[0][0]
        expect(docs).toHaveLength(2)
        for (const doc of docs) {
            expect(doc.ownerId).toEqual(new ObjectId(USER))
            expect(doc.sharedWith).toBeUndefined()
        }
    })

    it('leaves the payload alone in a repository that is not scoped', async () => {
        await new MongoRepository<any>({ database: 'app', collection: 'things' }).createOne({ payload: { name: 'x', ownerId: OTHER } })

        expect(insertOne.mock.calls[0][0]).toEqual({ name: 'x', ownerId: OTHER, __v: 1 })
    })

    it('drops the control fields on update and stamps who and when', async () => {
        await scopedRepo().updateOne({ where: { _id: DOC_ID }, payload: { ...clientPayload(), __v: 9, createdAt: new Date(0) }, scope: Scope.canEdit(user()) })

        const [filter, update] = findOneAndUpdate.mock.calls[0]
        expect(filter.$and[1]).toEqual({ ownerId: new ObjectId(USER) })
        expect(update.$inc).toEqual({ __v: 1 })
        expect(Object.keys(update.$set).sort()).toEqual(['name', 'updatedAt', 'updatedBy'])
        expect(update.$set.updatedBy).toEqual(new ObjectId(USER))
    })

    it('lets a trusted scope write the control fields but never the version nor the creation', async () => {
        await scopedRepo().updateOne({ where: { _id: DOC_ID }, payload: { ...clientPayload(), __v: 9, createdAt: new Date(0) }, scope: Scope.system('test') })

        const { $set } = findOneAndUpdate.mock.calls[0][1]
        expect($set.ownerId).toEqual(new ObjectId(OTHER))
        expect($set.__v).toBeUndefined()
        expect($set.createdAt).toBeUndefined()
        expect($set.updatedAt).toBeInstanceOf(Date)
        expect($set.updatedBy).toEqual(new ObjectId(OTHER))
    })

    it('drops the control fields on updateMany', async () => {
        await scopedRepo().updateMany({ where: {}, payload: { status: 'READ', ownerId: new ObjectId(OTHER) } as any, scope: Scope.canEdit(user()) })

        const [filter, update] = updateMany.mock.calls[0]
        expect(filter.$and[1]).toEqual({ ownerId: new ObjectId(USER) })
        expect(update.$set.status).toBe('READ')
        expect(update.$set.ownerId).toBeUndefined()
        expect(update.$set.updatedBy).toEqual(new ObjectId(USER))
    })

    it('marks the document as deleted by the user, only if it is theirs', async () => {
        await scopedRepo().softDelete({ where: { _id: DOC_ID }, payload: { deletedReason: 'bye' } as any, scope: Scope.canManage(user()) })

        const [filter, update] = findOneAndUpdate.mock.calls[0]
        expect(filter.$and[1]).toEqual({ ownerId: new ObjectId(USER) })
        expect(update.$set.deletedAt).toBeInstanceOf(Date)
        expect(update.$set.deletedBy).toEqual(new ObjectId(USER))
        expect(update.$set.deletedReason).toBe('bye')
        expect(update.$inc).toEqual({ __v: 1 })
    })

    it('unsets the fields that it is asked to when it soft deletes', async () => {
        await scopedRepo().softDelete({ where: { _id: DOC_ID }, payload: { toUnset: { 'triggers.schedule.nextRunAt': '' } } as any, scope: Scope.canManage(user()) })

        const update = findOneAndUpdate.mock.calls[0][1]
        expect(update.$unset).toEqual({ 'triggers.schedule.nextRunAt': '' })
        expect(update.$set.toUnset).toBeUndefined()
    })
})
