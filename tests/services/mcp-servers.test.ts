import { ObjectId } from 'mongodb'
import { McpServer, buildManifest } from '@services/mcp-servers/entities'
import { CreateMcpServerUseCase } from '@services/mcp-servers/use-cases/create-mcpserver.use-case'
import { UpdateMcpServerUseCase } from '@services/mcp-servers/use-cases/update-mcpserver.use-case'
import { DecideMcpServerTrustUseCase } from '@services/mcp-servers/use-cases/decide-mcpserver-trust.use-case'
import { VerifyMcpServerConnectionUseCase } from '@services/mcp-servers/use-cases/verify-mcpserver-connection.use-case'
import { ListAllMcpServersByUserUseCase } from '@services/mcp-servers/use-cases/list-all-mcpservers-by-user.use-case'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))
jest.mock('@services/mcp-servers/entities', () => jest.requireActual('@services/mcp-servers/entities'))

const OWNER_ID = new ObjectId().toHexString()
const collection = () => fakeMongo.collection('mcp_servers')

const regular: any = { userId: OWNER_ID, isAdmin: () => false }
const admin: any = { userId: OWNER_ID, isAdmin: () => true }

const manifestOf = (...names: string[]) => buildManifest({ tools: names.map(name => ({ name, description: name, inputSchema: { type: 'object', properties: {} } })) })

describe.each([['regular user', regular], ['admin', admin]])('MCP server use cases as a %s', (_label, currentUser) => {
    let live = manifestOf('ping')

    const create = (name = 'srv') => new CreateMcpServerUseCase().execute({ payload: { name, url: `http://fake/${name}`, type: 'http' }, currentUser })
    const stored = () => collection().docs[0]

    beforeEach(() => {
        fakeMongo.reset()
        live = manifestOf('ping')
        jest.spyOn(McpServer.prototype, 'fetchManifest').mockImplementation(async () => live)
    })

    afterEach(() => jest.restoreAllMocks())

    it('creates a locked server and records its manifest', async () => {
        const data = await create()

        expect(data?.trust).toBe('locked')
        expect(data?.status).toBe('ok')
        expect(stored().history.map((item: any) => item.hash)).toEqual([live.hash])
        expect(String(stored().ownerId)).toBe(OWNER_ID)
    })

    it('stores the environment, changes it and removes it with a blank text', async () => {
        const created = await new CreateMcpServerUseCase().execute({ payload: { name: 'srv', url: 'http://fake/srv', type: 'http', environment: 'staging' }, currentUser })
        const id = String(stored()._id)
        expect(created?.environment).toBe('staging')
        expect(stored().environment).toBe('staging')

        await new UpdateMcpServerUseCase().execute({ id, payload: { environment: 'production', __v: stored().__v }, currentUser })
        expect(stored().environment).toBe('production')

        await new UpdateMcpServerUseCase().execute({ id, payload: { name: 'srv2', __v: stored().__v }, currentUser })
        expect(stored().environment).toBe('production')

        await new UpdateMcpServerUseCase().execute({ id, payload: { environment: '', __v: stored().__v }, currentUser })
        expect(stored().environment).toBeUndefined()
    })

    it('updates a server and bumps its version', async () => {
        await create()
        const before = stored().__v

        const data = await new UpdateMcpServerUseCase().execute({ id: String(stored()._id), payload: { name: 'renamed', __v: before }, currentUser })

        expect(data.name).toBe('renamed')
        expect(stored().__v).toBe(before + 1)
    })

    it('keeps the stored trust when the payload carries trust fields', async () => {
        await create()
        const id = String(stored()._id)

        await new UpdateMcpServerUseCase().execute({ id, payload: { name: 'renamed', trust: 'approved', approvedHash: live.hash, __v: stored().__v }, currentUser })
        expect(stored().trust).toBe('locked')
        expect(stored().approvedHash).toBeUndefined()

        await new DecideMcpServerTrustUseCase().execute({ id, decision: 'approve', manifestHash: live.hash, currentUser })
        await new UpdateMcpServerUseCase().execute({ id, payload: { trust: 'blocked', approvedHash: 'other', __v: stored().__v }, currentUser })
        expect(stored().trust).toBe('approved')
        expect(stored().approvedHash).toBe(live.hash)
    })

    it('rejects an update made over a stale version', async () => {
        await create()

        await expect(new UpdateMcpServerUseCase().execute({ id: String(stored()._id), payload: { name: 'renamed', __v: stored().__v - 1 }, currentUser }))
            .rejects.toMatchObject({ code: 'VERSION_CONFLICT', statusCode: 409 })
    })

    it('approves the latest manifest', async () => {
        await create()
        const before = stored().__v

        const data = await new DecideMcpServerTrustUseCase().execute({ id: String(stored()._id), decision: 'approve', manifestHash: live.hash, currentUser })

        expect(data.trust).toBe('approved')
        expect(data.approvedHash).toBe(live.hash)
        expect(stored().__v).toBe(before + 1)
    })

    it('refuses to approve a manifest that is not the latest', async () => {
        await create()

        await expect(new DecideMcpServerTrustUseCase().execute({ id: String(stored()._id), decision: 'approve', manifestHash: 'other', currentUser })).rejects.toThrow()
        expect(stored().trust).toBe('locked')
    })

    it('blocks a server and unblocks it by approving the current manifest', async () => {
        await create()
        const decide = new DecideMcpServerTrustUseCase()
        const id = String(stored()._id)

        await decide.execute({ id, decision: 'block', currentUser })
        expect(stored().trust).toBe('blocked')

        await decide.execute({ id, decision: 'approve', manifestHash: live.hash, currentUser })
        expect(stored().trust).toBe('approved')
    })

    it('lets a version conflict propagate when deciding', async () => {
        await create()
        collection().beforeUpdate = () => { stored().__v += 1 }

        await expect(new DecideMcpServerTrustUseCase().execute({ id: String(stored()._id), decision: 'block', currentUser }))
            .rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    })

    it('verifies again after a version conflict and keeps the new manifest', async () => {
        await create()
        live = manifestOf('ping', 'pong')
        let conflicts = 1
        collection().beforeUpdate = () => { if (conflicts-- > 0) stored().__v += 1 }

        await new VerifyMcpServerConnectionUseCase().execute({ id: String(stored()._id), currentUser })

        expect(stored().history.map((item: any) => item.hash)).toEqual([live.hash, manifestOf('ping').hash])
    })

    it('gives up when the version conflict never goes away', async () => {
        await create()
        collection().beforeUpdate = () => { stored().__v += 1 }

        await expect(new VerifyMcpServerConnectionUseCase().execute({ id: String(stored()._id), currentUser }))
            .rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    })

    it('lists every server of the user, oldest first, past the paginated default', async () => {
        for (let index = 0; index < 12; index++) await create(`srv${String(index).padStart(2, '0')}`)
        await collection().insertOne({ name: 'foreign', ownerId: new ObjectId(), createdAt: new Date(), __v: 1 })

        const { items: data } = await new ListAllMcpServersByUserUseCase().execute({ currentUser })

        expect(data.map(item => item.name)).toEqual(Array.from({ length: 12 }, (_, index) => `srv${String(index).padStart(2, '0')}`))
    })
})
