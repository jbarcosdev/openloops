import 'reflect-metadata'
import { container } from 'tsyringe'
import {
    CreateUserUseCase,
    Params as CParams,
    Output as COutput,
} from '../modules/users/lambdas/create-user'
import {
    UpdateUserUseCase,
    Params as UParams,
    Output as UOutput,
} from '../modules/users/lambdas/update-user'
import {
    DeleteUserUseCase,
    Params as DParams,
    Output as DOutput,
} from '../modules/users/lambdas/delete-user'
import {
    GetUserByIdUseCase,
    Params as GParams,
    Output as GOutput,
} from '../modules/users/lambdas/get-user-by-id'
import {
    LoginUseCase,
    Params as LParams,
    Output as LOutput,
} from '../modules/authentication/lambdas/login'

export class App {
    public static async createUser (params: CParams): Promise<COutput> {
        const createUserUseCase = container.resolve(CreateUserUseCase)
        return await createUserUseCase.execute(params)
    }

    public static async updateUser (params: UParams): Promise<UOutput> {
        const updateUserUseCase = container.resolve(UpdateUserUseCase)
        return await updateUserUseCase.execute(params)
    }

    public static async deleteUser (params: DParams): Promise<DOutput> {
        const deleteUserUseCase = container.resolve(DeleteUserUseCase)
        return await deleteUserUseCase.execute(params)
    }

    public static async getUser (params: GParams): Promise<GOutput> {
        const getUserByIdUseCase = container.resolve(GetUserByIdUseCase)
        return await getUserByIdUseCase.execute(params)
    }

    public static async getUserByExternalId (params: GParams): Promise<GOutput> {
        const getUserByIdUseCase = container.resolve(GetUserByIdUseCase)
        return await getUserByIdUseCase.execute(params)
    }

    public static async authenticateUser (params: LParams): Promise<LOutput> {
        const loginUseCase = container.resolve(LoginUseCase)
        return await loginUseCase.execute(params)
    }
}
