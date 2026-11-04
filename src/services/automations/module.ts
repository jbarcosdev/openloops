import { CreateAutomationUseCase, Params as CParams, Output as COutput } from './use-cases/create-automation.use-case'
import { UpdateAutomationUseCase, Params as UParams, Output as UOutput } from './use-cases/update-automation.use-case'
import { GetAutomationByIdUseCase, Params as GParams, Output as GOutput } from './use-cases/get-automation-by-id.use-case'
import { ListAutomationsByUserUseCase, Params as LParams, Output as LOutput } from './use-cases/list-automations-by-user.use-case'
import { DeleteAutomationUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-automation.use-case'
import { PreviewAutomationRunsUseCase, Params as PParams, Output as POutput } from './use-cases/preview-automation-runs.use-case'
import { ListAutomationRunsByAutomationUseCase, Params as RJParams, Output as RJOutput } from './use-cases/list-automation-runs-by-automation.use-case'
import { ListAutomationRunsByUserUseCase, Params as RUParams, Output as RUOutput } from './use-cases/list-automation-runs-by-user.use-case'
import { ClaimDueAutomationsUseCase, Params as CDParams, Output as CDOutput } from './use-cases/claim-due-automations.use-case'
import { StartAutomationRunUseCase, Params as SRParams, Output as SROutput } from './use-cases/start-automation-run.use-case'
import { FinishAutomationRunUseCase, Params as FRParams, Output as FROutput } from './use-cases/finish-automation-run.use-case'
import { SyncAutomationRunUseCase, Params as SYParams, Output as SYOutput } from './use-cases/sync-automation-run.use-case'
import { SyncAutomationRunsUseCase, Params as SYSParams, Output as SYSOutput } from './use-cases/sync-automation-runs.use-case'
import { AttachAutomationRunChatUseCase, Params as ACParams, Output as ACOutput } from './use-cases/attach-automation-run-chat.use-case'
import { RenewAutomationLeaseUseCase, Params as RLParams, Output as RLOutput } from './use-cases/renew-automation-lease.use-case'
import { IssueAutomationEventTokenUseCase, Params as ITParams, Output as ITOutput } from './use-cases/issue-automation-event-token.use-case'
import { RevokeAutomationEventTokenUseCase, Params as RTParams, Output as RTOutput } from './use-cases/revoke-automation-event-token.use-case'
import { RotateAutomationEventTokensUseCase, Params as ROParams, Output as ROOutput } from './use-cases/rotate-automation-event-tokens.use-case'
import { ReceiveAutomationEventUseCase, Params as REParams, Output as REOutput } from './use-cases/receive-automation-event.use-case'
import { ClaimQueuedAutomationRunsUseCase, Params as CQParams, Output as CQOutput } from './use-cases/claim-queued-automation-runs.use-case'

export async function createAutomation (props: CParams): Promise<COutput> {
    const createAutomationUseCase = new CreateAutomationUseCase()
    return createAutomationUseCase.execute(props)
}

export async function updateAutomation (props: UParams): Promise<UOutput> {
    const updateAutomationUseCase = new UpdateAutomationUseCase()
    return updateAutomationUseCase.execute(props)
}

export async function getAutomationById (props: GParams): Promise<GOutput> {
    const getAutomationByIdUseCase = new GetAutomationByIdUseCase()
    return getAutomationByIdUseCase.execute(props)
}

export async function listAutomationsByUser (props: LParams): Promise<LOutput> {
    const listAutomationsByUserUseCase = new ListAutomationsByUserUseCase()
    return listAutomationsByUserUseCase.execute(props)
}

export async function deleteAutomation (props: DParams): Promise<DOutput> {
    const deleteAutomationUseCase = new DeleteAutomationUseCase()
    return deleteAutomationUseCase.execute(props)
}

export async function previewAutomationRuns (props: PParams): Promise<POutput> {
    const previewAutomationRunsUseCase = new PreviewAutomationRunsUseCase()
    return previewAutomationRunsUseCase.execute(props)
}

export async function listAutomationRunsByAutomation (props: RJParams): Promise<RJOutput> {
    const listAutomationRunsByAutomationUseCase = new ListAutomationRunsByAutomationUseCase()
    return listAutomationRunsByAutomationUseCase.execute(props)
}

export async function listAutomationRunsByUser (props: RUParams): Promise<RUOutput> {
    const listAutomationRunsByUserUseCase = new ListAutomationRunsByUserUseCase()
    return listAutomationRunsByUserUseCase.execute(props)
}

export async function claimDueAutomations (props: CDParams): Promise<CDOutput> {
    const claimDueAutomationsUseCase = new ClaimDueAutomationsUseCase()
    return claimDueAutomationsUseCase.execute(props)
}

export async function startAutomationRun (props: SRParams): Promise<SROutput> {
    const startAutomationRunUseCase = new StartAutomationRunUseCase()
    return startAutomationRunUseCase.execute(props)
}

export async function finishAutomationRun (props: FRParams): Promise<FROutput> {
    const finishAutomationRunUseCase = new FinishAutomationRunUseCase()
    return finishAutomationRunUseCase.execute(props)
}

export async function syncAutomationRun (props: SYParams): Promise<SYOutput> {
    const syncAutomationRunUseCase = new SyncAutomationRunUseCase()
    return syncAutomationRunUseCase.execute(props)
}

export async function syncAutomationRuns (props: SYSParams = {}): Promise<SYSOutput> {
    const syncAutomationRunsUseCase = new SyncAutomationRunsUseCase()
    return syncAutomationRunsUseCase.execute(props)
}

export async function attachAutomationRunChat (props: ACParams): Promise<ACOutput> {
    const attachAutomationRunChatUseCase = new AttachAutomationRunChatUseCase()
    return attachAutomationRunChatUseCase.execute(props)
}

export async function renewAutomationLease (props: RLParams): Promise<RLOutput> {
    const renewAutomationLeaseUseCase = new RenewAutomationLeaseUseCase()
    return renewAutomationLeaseUseCase.execute(props)
}

export async function issueAutomationEventToken (props: ITParams): Promise<ITOutput> {
    const issueAutomationEventTokenUseCase = new IssueAutomationEventTokenUseCase()
    return issueAutomationEventTokenUseCase.execute(props)
}

export async function revokeAutomationEventToken (props: RTParams): Promise<RTOutput> {
    const revokeAutomationEventTokenUseCase = new RevokeAutomationEventTokenUseCase()
    return revokeAutomationEventTokenUseCase.execute(props)
}

export async function rotateAutomationEventTokens (props: ROParams): Promise<ROOutput> {
    const rotateAutomationEventTokensUseCase = new RotateAutomationEventTokensUseCase()
    return rotateAutomationEventTokensUseCase.execute(props)
}

export async function receiveAutomationEvent (props: REParams): Promise<REOutput> {
    const receiveAutomationEventUseCase = new ReceiveAutomationEventUseCase()
    return receiveAutomationEventUseCase.execute(props)
}

export async function claimQueuedAutomationRuns (props: CQParams): Promise<CQOutput> {
    const claimQueuedAutomationRunsUseCase = new ClaimQueuedAutomationRunsUseCase()
    return claimQueuedAutomationRunsUseCase.execute(props)
}
