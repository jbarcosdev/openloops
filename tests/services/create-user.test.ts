import 'reflect-metadata'
import { container } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { CreateUserUseCase } from '@services/users/use-cases/create-user.use-case'
import { Scope } from '@common/repositories/scope'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const users = () => fakeMongo.collection('users')
const payload = { email: 'new@openloops.xyz', password: 'a-real-password', role: 'user' } as any
const creator: any = { userId: new ObjectId().toHexString(), isAdmin: () => false }

describe('creating a user', () => {
    const create = (params: Record<string, any>) => container.resolve(CreateUserUseCase).execute({ payload, ...params })

    beforeEach(() => fakeMongo.reset())

    it('saves createdAt even when the scope has no user', async () => {
        await create({ scope: Scope.system('test') })

        expect(users().docs[0].createdAt).toBeInstanceOf(Date)
        expect(users().docs[0].createdBy).toBeUndefined()
    })

    it('removes the admin fields when a user creates it', async () => {
        await create({ currentUser: creator })

        expect(users().docs[0].role).toBeUndefined()
    })

    it('keeps the admin fields when the scope is trusted', async () => {
        await create({ scope: Scope.system('test') })

        expect(users().docs[0].role).toBe('user')
        expect(users().docs[0].createdAt).toBeInstanceOf(Date)
    })

    it('refuses to create a user without a user or a scope', async () => {
        await expect(create({})).rejects.toMatchObject({ statusCode: 401 })
        expect(users().docs).toHaveLength(0)
    })

    it('saves who created the user when there is a current user', async () => {
        await create({ currentUser: creator })

        expect(String(users().docs[0].createdBy)).toBe(creator.userId)
        expect(users().docs[0].createdAt).toBeInstanceOf(Date)
    })
})
