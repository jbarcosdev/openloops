import 'reflect-metadata'
import { container } from 'tsyringe'
import { LoginUseCase, Params as LParams, Output as LOutput } from './lambdas/login'

export async function login (props: LParams): Promise<LOutput> {
    const loginUseCase = container.resolve(LoginUseCase)
    return loginUseCase.execute(props)
}
