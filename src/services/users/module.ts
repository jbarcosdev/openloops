import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateUserUseCase, Params as CParams, Output as COutput } from './use-cases/create-user.use-case'
import { UpdateUserUseCase, Params as UParams, Output as UOutput } from './use-cases/update-user.use-case'
import { GetUserByIdUseCase, Params as GParams, Output as GOutput } from './use-cases/get-user-by-id.use-case'
import { ListUsersByPropsUseCase, Params as LParams, Output as LOutput } from './use-cases/list-users-by-props.use-case'
import { DeleteUserUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-user.use-case'

export async function createUser (props: CParams): Promise<COutput> {
    const createUserUseCase = container.resolve(CreateUserUseCase)
    return createUserUseCase.execute(props)
}

export async function updateUser (props: UParams): Promise<UOutput> {
    const updateUserUseCase = container.resolve(UpdateUserUseCase)
    return updateUserUseCase.execute(props)
}

export async function getUserById (props: GParams): Promise<GOutput> {
    const getUserByIdUseCase = container.resolve(GetUserByIdUseCase)
    return getUserByIdUseCase.execute(props)
}

export async function ListUsersByProps (props: LParams): Promise<LOutput> {
    const listUsersByPropsUseCase = container.resolve(ListUsersByPropsUseCase)
    return listUsersByPropsUseCase.execute(props)
}

export async function deleteUser (props: DParams): Promise<DOutput> {
    const deleteUserUseCase = container.resolve(DeleteUserUseCase)
    return deleteUserUseCase.execute(props)
}
