import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateChatUseCase, Params as CParams, Output as COutput } from './use-cases/create-chat.use-case'
import { UpdateChatUseCase, Params as UParams, Output as UOutput } from './use-cases/update-chat.use-case'
import { GetChatByIdUseCase, Params as GParams, Output as GOutput } from './use-cases/get-chat-by-id.use-case'
import { ListChatsByUserUseCase, Params as LParams, Output as LOutput } from './use-cases/list-chats-by-user.use-case'
import { DeleteChatUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-chat.use-case'

export async function createChat (props: CParams): Promise<COutput> {
    const createChatUseCase = container.resolve(CreateChatUseCase)
    return createChatUseCase.execute(props)
}

export async function updateChat (props: UParams): Promise<UOutput> {
    const updateChatUseCase = container.resolve(UpdateChatUseCase)
    return updateChatUseCase.execute(props)
}

export async function getChatById (props: GParams): Promise<GOutput> {
    const getChatByIdUseCase = container.resolve(GetChatByIdUseCase)
    return getChatByIdUseCase.execute(props)
}

export async function listChatsByUser (props: LParams): Promise<LOutput> {
    const listChatsByUserUseCase = container.resolve(ListChatsByUserUseCase)
    return listChatsByUserUseCase.execute(props)
}

export async function deleteChat (props: DParams): Promise<DOutput> {
    const deleteChatUseCase = container.resolve(DeleteChatUseCase)
    return deleteChatUseCase.execute(props)
}
