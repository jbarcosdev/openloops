import { ObjectId } from 'mongodb'
import { ListChatsByUserUseCase } from '@services/chats/use-cases/list-chats-by-user.use-case'
import { ChatRepository } from '@services/chats/repositories'

const user = { userId: new ObjectId().toHexString(), isAdmin: () => false } as any

describe('listChatsByUser', () => {
    const findManyPaginated = jest.fn(async () => ({ items: [], hasMore: false }))
    const useCase = new ListChatsByUserUseCase({ _: { findManyPaginated } } as unknown as ChatRepository)

    beforeEach(() => findManyPaginated.mockClear())

    const lastCall = () => (findManyPaginated.mock.calls[0] as any[])[0]

    it('sends no projection when select is not given, so the chats come complete', async () => {
        await useCase.execute({ currentUser: user })

        expect(lastCall()).not.toHaveProperty('select')
    })

    it('sends the projection when select is given', async () => {
        await useCase.execute({ select: { title: 1, updatedAt: 1 }, currentUser: user })

        expect(lastCall().select).toEqual({ title: 1, updatedAt: 1 })
    })

    it('searches the title and the messages whatever the projection is, with the text escaped', async () => {
        await useCase.execute({ search: 'a.b(', select: { title: 1 }, currentUser: user })

        expect(lastCall().where.$or).toEqual([
            { title: { $regex: 'a\\.b\\(', $options: 'i' } },
            { 'messages.content': { $regex: 'a\\.b\\(', $options: 'i' } },
        ])
    })

    it('adds no search condition for an empty text', async () => {
        await useCase.execute({ search: '   ', currentUser: user })

        expect(lastCall().where).not.toHaveProperty('$or')
    })
})
