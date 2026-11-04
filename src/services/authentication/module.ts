import { LoginUseCase, Params as LParams, Output as LOutput } from './use-cases/login.use-case'
import { RefreshUseCase, Params as RParams, Output as ROutput } from './use-cases/refresh.use-case'
import { LogoutUseCase, Params as OParams, Output as OOutput } from './use-cases/logout.use-case'
import { IssuePasswordResetTokenUseCase, Params as PParams, Output as POutput } from './use-cases/issue-password-reset-token.use-case'
import { ResetPasswordUseCase, Params as SParams, Output as SOutput } from './use-cases/reset-password.use-case'
import { RevokeUserRefreshTokensUseCase, Params as UParams, Output as UOutput } from './use-cases/revoke-user-refresh-tokens.use-case'
import { RevokeTokenUseCase, Params as TParams, Output as TOutput } from './use-cases/revoke-token.use-case'
import { IsTokenRevokedUseCase, Params as IParams, Output as IOutput } from './use-cases/is-token-revoked.use-case'

export async function login (props: LParams): Promise<LOutput> {
    const loginUseCase = new LoginUseCase()
    return loginUseCase.execute(props)
}

export async function refreshSession (props: RParams): Promise<ROutput> {
    const refreshUseCase = new RefreshUseCase()
    return refreshUseCase.execute(props)
}

export async function logout (props: OParams): Promise<OOutput> {
    const logoutUseCase = new LogoutUseCase()
    return logoutUseCase.execute(props)
}

export async function issuePasswordResetToken (props: PParams): Promise<POutput> {
    const issuePasswordResetTokenUseCase = new IssuePasswordResetTokenUseCase()
    return issuePasswordResetTokenUseCase.execute(props)
}

export async function resetPassword (props: SParams): Promise<SOutput> {
    const resetPasswordUseCase = new ResetPasswordUseCase()
    return resetPasswordUseCase.execute(props)
}

export async function revokeUserSessions (props: UParams): Promise<UOutput> {
    const revokeUserRefreshTokensUseCase = new RevokeUserRefreshTokensUseCase()
    return revokeUserRefreshTokensUseCase.execute(props)
}

export async function revokeToken (props: TParams): Promise<TOutput> {
    const revokeTokenUseCase = new RevokeTokenUseCase()
    return revokeTokenUseCase.execute(props)
}

export async function isTokenRevoked (props: IParams): Promise<IOutput> {
    const isTokenRevokedUseCase = new IsTokenRevokedUseCase()
    return isTokenRevokedUseCase.execute(props)
}
