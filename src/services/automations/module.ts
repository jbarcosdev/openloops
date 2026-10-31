import 'reflect-metadata'
import { container } from 'tsyringe'
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

export async function createAutomation (props: CParams): Promise<COutput> {
    const createAutomationUseCase = container.resolve(CreateAutomationUseCase)
    return createAutomationUseCase.execute(props)
}

export async function updateAutomation (props: UParams): Promise<UOutput> {
    const updateAutomationUseCase = container.resolve(UpdateAutomationUseCase)
    return updateAutomationUseCase.execute(props)
}

export async function getAutomationById (props: GParams): Promise<GOutput> {
    const getAutomationByIdUseCase = container.resolve(GetAutomationByIdUseCase)
    return getAutomationByIdUseCase.execute(props)
}

export async function listAutomationsByUser (props: LParams): Promise<LOutput> {
    const listAutomationsByUserUseCase = container.resolve(ListAutomationsByUserUseCase)
    return listAutomationsByUserUseCase.execute(props)
}

export async function deleteAutomation (props: DParams): Promise<DOutput> {
    const deleteAutomationUseCase = container.resolve(DeleteAutomationUseCase)
    return deleteAutomationUseCase.execute(props)
}

export async function previewAutomationRuns (props: PParams): Promise<POutput> {
    const previewAutomationRunsUseCase = container.resolve(PreviewAutomationRunsUseCase)
    return previewAutomationRunsUseCase.execute(props)
}

export async function listAutomationRunsByAutomation (props: RJParams): Promise<RJOutput> {
    const listAutomationRunsByAutomationUseCase = container.resolve(ListAutomationRunsByAutomationUseCase)
    return listAutomationRunsByAutomationUseCase.execute(props)
}

export async function listAutomationRunsByUser (props: RUParams): Promise<RUOutput> {
    const listAutomationRunsByUserUseCase = container.resolve(ListAutomationRunsByUserUseCase)
    return listAutomationRunsByUserUseCase.execute(props)
}

export async function claimDueAutomations (props: CDParams): Promise<CDOutput> {
    const claimDueAutomationsUseCase = container.resolve(ClaimDueAutomationsUseCase)
    return claimDueAutomationsUseCase.execute(props)
}

export async function startAutomationRun (props: SRParams): Promise<SROutput> {
    const startAutomationRunUseCase = container.resolve(StartAutomationRunUseCase)
    return startAutomationRunUseCase.execute(props)
}

export async function finishAutomationRun (props: FRParams): Promise<FROutput> {
    const finishAutomationRunUseCase = container.resolve(FinishAutomationRunUseCase)
    return finishAutomationRunUseCase.execute(props)
}

export async function syncAutomationRun (props: SYParams): Promise<SYOutput> {
    const syncAutomationRunUseCase = container.resolve(SyncAutomationRunUseCase)
    return syncAutomationRunUseCase.execute(props)
}

export async function syncAutomationRuns (props: SYSParams = {}): Promise<SYSOutput> {
    const syncAutomationRunsUseCase = container.resolve(SyncAutomationRunsUseCase)
    return syncAutomationRunsUseCase.execute(props)
}

export async function attachAutomationRunChat (props: ACParams): Promise<ACOutput> {
    const attachAutomationRunChatUseCase = container.resolve(AttachAutomationRunChatUseCase)
    return attachAutomationRunChatUseCase.execute(props)
}

export async function renewAutomationLease (props: RLParams): Promise<RLOutput> {
    const renewAutomationLeaseUseCase = container.resolve(RenewAutomationLeaseUseCase)
    return renewAutomationLeaseUseCase.execute(props)
}
