import { ObjectId } from 'mongodb'
import { McpServer } from '@services/mcp-servers/entities'
import { CreateMcpServerUseCase } from '@services/mcp-servers/use-cases/create-mcpserver.use-case'
import { UpdateMcpServerUseCase } from '@services/mcp-servers/use-cases/update-mcpserver.use-case'
import { GetMcpServerByIdUseCase } from '@services/mcp-servers/use-cases/get-mcpserver-by-id.use-case'
import { DeleteMcpServerUseCase } from '@services/mcp-servers/use-cases/delete-mcpserver.use-case'
import { DecideMcpServerTrustUseCase } from '@services/mcp-servers/use-cases/decide-mcpserver-trust.use-case'
import { ListAllMcpServersByUserUseCase } from '@services/mcp-servers/use-cases/list-all-mcpservers-by-user.use-case'
import { ListMcpServersByUserUseCase } from '@services/mcp-servers/use-cases/list-mcpservers-by-user.use-case'
import { CreateInternalMcpUseCase } from '@services/mcp-servers/admin/use-cases/create-internal-mcp.use-case'
import { UpdateInternalMcpUseCase } from '@services/mcp-servers/admin/use-cases/update-internal-mcp.use-case'
import { GetInternalMcpByIdUseCase } from '@services/mcp-servers/admin/use-cases/get-internal-mcp-by-id.use-case'
import { ListInternalMcpsUseCase } from '@services/mcp-servers/admin/use-cases/list-internal-mcps.use-case'
import { DeleteInternalMcpUseCase } from '@services/mcp-servers/admin/use-cases/delete-internal-mcp.use-case'
import { listActiveInternalMcps } from '@services/mcp-servers/internal'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))
jest.mock('@services/mcp-servers/entities', () => jest.requireActual('@services/mcp-servers/entities'))
jest.mock('@services/mcp-servers/internal', () => jest.requireActual('@services/mcp-servers/internal'))

const collection = () => fakeMongo.collection('mcp_servers')

const regular: any = { userId: new ObjectId().toHexString(), isAdmin: () => false }
const admin: any = { userId: new ObjectId().toHexString(), isAdmin: () => true }

const payload = { name: 'crm', url: 'http://fake/crm', headers: { Authorization: 'Bearer {{token}}' } }

describe('internal MCP servers of the back office', () => {
    const createInternal = (body = payload, currentUser = admin) => new CreateInternalMcpUseCase().execute({ payload: body, currentUser })
    const stored = () => collection().docs[0]

    beforeEach(() => {
        fakeMongo.reset()
        jest.spyOn(McpServer.prototype, 'fetchManifest').mockResolvedValue({ hash: 'h', tools: [] } as any)
    })

    afterEach(() => jest.restoreAllMocks())

    describe('who can use them', () => {
        it('refuses every use case to a user who is not an admin', async () => {
            const created = await createInternal()
            const id = String(created._id)
            const calls = [
                () => createInternal(payload, regular),
                () => new UpdateInternalMcpUseCase().execute({ id, payload: { enabled: false }, currentUser: regular }),
                () => new GetInternalMcpByIdUseCase().execute({ id, currentUser: regular }),
                () => new ListInternalMcpsUseCase().execute({ currentUser: regular }),
                () => new DeleteInternalMcpUseCase().execute({ id, currentUser: regular }),
            ]

            for (const call of calls) await expect(call()).rejects.toMatchObject({ statusCode: 403 })
            expect(collection().docs).toHaveLength(1)
        })

        it('refuses a request without a user', async () => {
            await expect(new CreateInternalMcpUseCase().execute({ payload })).rejects.toMatchObject({ statusCode: 401 })
        })
    })

    describe('managing them', () => {
        it('creates an enabled internal server without owner, trust or verification', async () => {
            const created = await createInternal()

            expect(created).toMatchObject({ name: 'crm', url: 'http://fake/crm', type: 'http', internal: true, enabled: true })
            expect(stored().ownerId).toBeUndefined()
            expect(stored().trust).toBeUndefined()
            expect(stored().history).toBeUndefined()
            expect(McpServer.prototype.fetchManifest).not.toHaveBeenCalled()
        })

        it('needs a name and a url', async () => {
            await expect(createInternal({ name: 'crm' } as any)).rejects.toMatchObject({ statusCode: 400 })
            await expect(createInternal({ url: 'http://x' } as any)).rejects.toMatchObject({ statusCode: 400 })
        })

        it('refuses a second internal server with the same name', async () => {
            await createInternal()

            await expect(createInternal()).rejects.toMatchObject({ statusCode: 409 })
        })

        it('updates, disables, renames and detects a stale version', async () => {
            const created = await createInternal()
            const id = String(created._id)

            const updated = await new UpdateInternalMcpUseCase().execute({ id, payload: { enabled: false, name: 'crm2', __v: stored().__v }, currentUser: admin })
            expect(updated).toMatchObject({ name: 'crm2', enabled: false, internal: true })

            await expect(new UpdateInternalMcpUseCase().execute({ id, payload: { enabled: true, __v: stored().__v - 1 }, currentUser: admin }))
                .rejects.toMatchObject({ code: 'VERSION_CONFLICT', statusCode: 409 })
        })

        it('refuses to rename to a name that is taken and to blank the url', async () => {
            await createInternal()
            const other = await createInternal({ name: 'erp', url: 'http://fake/erp' } as any)
            const id = String(other._id)

            await expect(new UpdateInternalMcpUseCase().execute({ id, payload: { name: 'crm' }, currentUser: admin })).rejects.toMatchObject({ statusCode: 409 })
            await expect(new UpdateInternalMcpUseCase().execute({ id, payload: { url: '' }, currentUser: admin })).rejects.toMatchObject({ statusCode: 400 })
        })

        it('lists and gets only internal servers', async () => {
            await createInternal()
            await new CreateMcpServerUseCase().execute({ payload: { name: 'mine', url: 'http://fake/mine', type: 'http' }, currentUser: admin })
            const mine = collection().docs.find((doc: any) => doc.name === 'mine')!

            const page = await new ListInternalMcpsUseCase().execute({ currentUser: admin })

            expect(page.items.map(item => item.name)).toEqual(['crm'])
            expect(await new GetInternalMcpByIdUseCase().execute({ id: String(mine._id), currentUser: admin })).toBeNull()
        })

        it('deletes for good, and answers 404 when it does not exist', async () => {
            const created = await createInternal()

            await new DeleteInternalMcpUseCase().execute({ id: String(created._id), currentUser: admin })
            expect(collection().docs).toHaveLength(0)
            await expect(new DeleteInternalMcpUseCase().execute({ id: String(created._id), currentUser: admin })).rejects.toMatchObject({ statusCode: 404 })
        })
    })

    describe('what the users can do with them', () => {
        const withExternal = async () => {
            const created = await createInternal()
            await new CreateMcpServerUseCase().execute({ payload: { name: 'mine', url: 'http://fake/mine', type: 'http' }, currentUser: regular })
            return String(created._id)
        }

        it('never list them', async () => {
            await withExternal()

            const all = await new ListAllMcpServersByUserUseCase().execute({ currentUser: regular })
            const page = await new ListMcpServersByUserUseCase().execute({ currentUser: regular })

            expect(all.items.map(item => item.name)).toEqual(['mine'])
            expect(page.items.map(item => item.name)).toEqual(['mine'])
        })

        it('cannot read, update, decide or delete them, not even an admin with the normal use cases', async () => {
            const id = await withExternal()

            for (const currentUser of [regular, admin]) {
                expect(await new GetMcpServerByIdUseCase().execute({ id, currentUser })).toBeNull()
                await expect(new UpdateMcpServerUseCase().execute({ id, payload: { name: 'x' }, currentUser })).rejects.toMatchObject({ statusCode: 404 })
                await expect(new DecideMcpServerTrustUseCase().execute({ id, decision: 'block', currentUser })).rejects.toMatchObject({ statusCode: 404 })
                await expect(new DeleteMcpServerUseCase().execute({ id, currentUser })).rejects.toMatchObject({ statusCode: 404 })
            }

            expect(await new DeleteMcpServerUseCase().execute({ id, hardDelete: true, currentUser: admin })).toEqual({ deletedCount: 0 })
            expect(collection().docs.some((doc: any) => doc.internal)).toBe(true)
        })

        it('cannot mark their own server as internal, when creating or updating', async () => {
            const created = await new CreateMcpServerUseCase().execute({ payload: { name: 'mine', url: 'http://fake/mine', type: 'http', internal: true, enabled: true }, currentUser: regular })
            expect(created?.internal).toBeUndefined()
            expect(stored().internal).toBeUndefined()

            await new UpdateMcpServerUseCase().execute({ id: String(stored()._id), payload: { internal: true, enabled: true, __v: stored().__v }, currentUser: regular })
            expect(stored().internal).toBeUndefined()
            expect(stored().enabled).toBeUndefined()
        })
    })

    describe('loading them for a run', () => {
        it('returns only the enabled internal servers, with what is needed to connect', async () => {
            await createInternal()
            await createInternal({ name: 'off', url: 'http://fake/off', enabled: false } as any)
            await new CreateMcpServerUseCase().execute({ payload: { name: 'mine', url: 'http://fake/mine', type: 'http' }, currentUser: regular })

            expect(await listActiveInternalMcps()).toEqual([{ name: 'crm', url: 'http://fake/crm', headers: { Authorization: 'Bearer {{token}}' } }])
        })
    })
})
