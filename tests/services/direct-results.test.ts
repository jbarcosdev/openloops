import { ObjectId } from 'mongodb'
import { Scope } from '@common/repositories'
import { ChatRepository } from '@services/chats/repositories'
import { CreateChatUseCase } from '@services/chats/use-cases/create-chat.use-case'
import { DeleteChatUseCase } from '@services/chats/use-cases/delete-chat.use-case'
import { GetChatByIdUseCase } from '@services/chats/use-cases/get-chat-by-id.use-case'
import { ListChatsByUserUseCase } from '@services/chats/use-cases/list-chats-by-user.use-case'

const user: any = { userId: new ObjectId().toString(), isAdmin: () => false }
const admin: any = { userId: new ObjectId().toString(), isAdmin: () => true }

describe('the use cases answer the result itself', () => {
    afterEach(() => jest.restoreAllMocks())

    it('answers null when the chat is not there', async () => {
        jest.spyOn(ChatRepository.prototype, 'findById').mockResolvedValue(null)

        await expect(new GetChatByIdUseCase().execute({ id: new ObjectId().toString(), currentUser: user })).resolves.toBeNull()
    })

    it('answers the chat props, not an envelope', async () => {
        jest.spyOn(ChatRepository.prototype, 'findById').mockResolvedValue({ _id: new ObjectId(), state: { status: 'idle' } } as any)

        const chat = await new GetChatByIdUseCase().execute({ id: new ObjectId().toString(), currentUser: user })

        expect(chat).toMatchObject({ state: { status: 'idle' } })
        expect(chat).not.toHaveProperty('data')
    })

    it('lists with items and hasMore, always there', async () => {
        const repository: any = { _: { findManyPaginated: async () => ({ items: [{ _id: new ObjectId() }], hasMore: true }) } }

        const page = await new ListChatsByUserUseCase(repository).execute({ currentUser: user })

        expect(page.items).toHaveLength(1)
        expect(page.hasMore).toBe(true)
    })

    it('answers an empty page when the repository finds nothing', async () => {
        const repository: any = { _: { findManyPaginated: async () => undefined } }

        await expect(new ListChatsByUserUseCase(repository).execute({ currentUser: user })).resolves.toEqual({ items: [], hasMore: false })
    })

    it('throws a 404 when it soft deletes a chat that is not the user\'s, and counts a hard delete', async () => {
        jest.spyOn(ChatRepository.prototype, 'softDeleteById').mockResolvedValue(null)
        jest.spyOn(ChatRepository.prototype, 'deleteById').mockResolvedValue(1)

        await expect(new DeleteChatUseCase().execute({ id: 'c1', currentUser: user })).rejects.toMatchObject({ statusCode: 404 })
        await expect(new DeleteChatUseCase().execute({ id: 'c1', hardDelete: true, currentUser: admin, scope: Scope.asAdmin(admin) })).resolves.toEqual({ deletedCount: 1 })
    })

    it('answers the created chat as plain props', async () => {
        jest.spyOn(ChatRepository.prototype, 'create').mockImplementation(async chat => chat)

        const chat = await new CreateChatUseCase().execute({ payload: { settings: { loopName: 'agi' } }, currentUser: user })

        expect(chat.settings).toMatchObject({ loopName: 'agi' })
        expect(chat.constructor).toBe(Object)
    })
})
