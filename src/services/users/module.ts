import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateUserUseCase, Params as CParams, Output as COutput } from './lambdas/create-user'
import { UpdateUserUseCase, Params as UParams, Output as UOutput } from './lambdas/update-user'
import { GetUserByIdUseCase, Params as GParams, Output as GOutput } from './lambdas/get-user-by-id'
import { ListUsersByPropsUseCase, Params as LParams, Output as LOutput } from './lambdas/list-users-by-props'
import { DeleteUserUseCase, Params as DParams, Output as DOutput } from './lambdas/delete-user'

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
