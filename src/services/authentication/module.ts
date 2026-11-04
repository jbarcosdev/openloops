import { LoginUseCase, Params as LParams, Output as LOutput } from './use-cases/login.use-case'
import { RevokeTokenUseCase, Params as RParams, Output as ROutput } from './use-cases/revoke-token.use-case'
import { IsTokenRevokedUseCase, Params as IParams, Output as IOutput } from './use-cases/is-token-revoked.use-case'

export async function login (props: LParams): Promise<LOutput> {
    const loginUseCase = new LoginUseCase()
    return loginUseCase.execute(props)
}

export async function revokeToken (props: RParams): Promise<ROutput> {
    const revokeTokenUseCase = new RevokeTokenUseCase()
    return revokeTokenUseCase.execute(props)
}

export async function isTokenRevoked (props: IParams): Promise<IOutput> {
    const isTokenRevokedUseCase = new IsTokenRevokedUseCase()
    return isTokenRevokedUseCase.execute(props)
}
