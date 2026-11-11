const findOne = jest.fn()

jest.mock('@common/repositories/mongo-db.client', () => ({ getMongoDBClient: () => ({ db: async () => ({ collection: () => ({ findOne }) }) }) }))

import { ObjectId } from 'mongodb'

import { CurrentUser } from '@common/base/current-user'

describe('CurrentUser', () => {
    it('is on the free plan until it is premium', () => {
        const user = new CurrentUser({} as any)

        expect(user.isFreePlan()).toBe(true)

        user.setIsPremium(true)

        expect(user.isFreePlan()).toBe(false)
    })
})

describe('CurrentUser.asyncFromDB', () => {
    const id = new ObjectId().toString()

    beforeEach(() => findOne.mockReset())

    it('does not load a deleted or archived user', async () => {
        findOne.mockResolvedValue(null)

        expect(await CurrentUser.asyncFromDB(id)).toBeUndefined()

        const [filter] = findOne.mock.calls[0]
        expect(filter._id.toString()).toBe(id)
        expect(filter.deletedAt).toBeNull()
        expect(filter.archivedAt).toBeNull()
    })

    it('returns undefined without an id', async () => {
        expect(await CurrentUser.asyncFromDB('')).toBeUndefined()
        expect(findOne).not.toHaveBeenCalled()
    })
})
