import 'reflect-metadata'
import { container } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { CreateUserUseCase } from '@services/users/use-cases/create-user.use-case'
import { UpdateUserUseCase } from '@services/users/use-cases/update-user.use-case'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))
jest.mock('@clients/llm/model-resolution', () => ({
    ...jest.requireActual('@clients/llm/model-resolution'),
    isKnownModel: jest.fn(async (provider: string, model: string) => provider === 'anthropic' && model.startsWith('claude')),
}))

const users = () => fakeMongo.collection('users')
const admin: any = { userId: new ObjectId().toHexString(), isAdmin: () => true }

describe('the default model of a user', () => {
    let id: string

    const update = (payload: Record<string, any>) => container.resolve(UpdateUserUseCase).execute({ id, payload, currentUser: admin })

    beforeEach(async () => {
        fakeMongo.reset()
        const { insertedId } = await users().insertOne({ email: 'jose@openloops.xyz', firstName: 'Jose', preferences: { language: { isoCode: 'es' }, currency: { isoCode: 'PEN' } }, __v: 1 })
        id = String(insertedId)
    })

    it('is saved without touching the other preferences', async () => {
        await update({ preferences: { defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' } } })

        expect(users().docs[0].preferences).toMatchObject({
            language: { isoCode: 'es' },
            currency: { isoCode: 'PEN' },
            defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' },
        })
    })

    it('is returned with the preferences of the user', async () => {
        const { data } = await update({ preferences: { defaultModel: { provider: ' anthropic ', model: ' claude-haiku-5-5 ' } } })

        expect(data.preferences?.defaultModel).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    })

    it('is kept when something else of the user changes', async () => {
        await update({ preferences: { defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' } } })
        await update({ firstName: 'Josue' })
        await update({ preferences: { language: { isoCode: 'en' } } })

        expect(users().docs[0].preferences.defaultModel).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' })
        expect(users().docs[0].preferences.language.isoCode).toBe('en')
    })

    it('can be changed', async () => {
        await update({ preferences: { defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' } } })
        await update({ preferences: { defaultModel: { provider: 'anthropic', model: 'claude-sonnet-5-5' } } })

        expect(users().docs[0].preferences.defaultModel).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
    })

    it('is removed with null, and the other preferences stay', async () => {
        await update({ preferences: { defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' } } })
        await update({ preferences: { defaultModel: null } })

        expect(users().docs[0].preferences.defaultModel).toBeUndefined()
        expect(users().docs[0].preferences.language.isoCode).toBe('es')
    })

    it.each([
        [{ provider: 'anthropic' }, /needs a provider and a model/],
        [{ model: 'claude-haiku-5-5' }, /needs a provider and a model/],
        [{ provider: '', model: '' }, /needs a provider and a model/],
        [{ provider: 'anthropic', model: 'gpt-4o-mini' }, /does not exist/],
        [{ provider: 'nobody', model: 'claude-haiku-5-5' }, /does not exist/],
    ])('rejects %j', async (defaultModel, message) => {
        await expect(update({ preferences: { defaultModel } })).rejects.toThrow(message)
        expect(users().docs[0].preferences.defaultModel).toBeUndefined()
    })

    it('is validated when a user is created', async () => {
        const create = (defaultModel: any) => container.resolve(CreateUserUseCase).execute({
            payload: { email: 'new@openloops.xyz', password: 'a-real-password', preferences: { defaultModel } },
            currentUser: admin,
        })

        await expect(create({ provider: 'anthropic', model: 'gpt-4o-mini' })).rejects.toThrow(/does not exist/)

        const { data } = await create({ provider: 'anthropic', model: 'claude-haiku-5-5' })
        expect(data.preferences?.defaultModel).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    })
})
