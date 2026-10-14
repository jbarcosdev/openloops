import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateAgenticJobUseCase, Params as CParams, Output as COutput } from './use-cases/create-agentic-job.use-case'
import { UpdateAgenticJobUseCase, Params as UParams, Output as UOutput } from './use-cases/update-agentic-job.use-case'
import { GetAgenticJobByIdUseCase, Params as GParams, Output as GOutput } from './use-cases/get-agentic-job-by-id.use-case'
import { ListAgenticJobsByUserUseCase, Params as LParams, Output as LOutput } from './use-cases/list-agentic-jobs-by-user.use-case'
import { DeleteAgenticJobUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-agentic-job.use-case'
import { PreviewAgenticJobRunsUseCase, Params as PParams, Output as POutput } from './use-cases/preview-agentic-job-runs.use-case'
import { ListAgenticJobRunsByJobUseCase, Params as RJParams, Output as RJOutput } from './use-cases/list-agentic-job-runs-by-job.use-case'
import { ListAgenticJobRunsByUserUseCase, Params as RUParams, Output as RUOutput } from './use-cases/list-agentic-job-runs-by-user.use-case'
import { ClaimDueAgenticJobsUseCase, Params as CDParams, Output as CDOutput } from './use-cases/claim-due-agentic-jobs.use-case'
import { StartAgenticJobRunUseCase, Params as SRParams, Output as SROutput } from './use-cases/start-agentic-job-run.use-case'
import { FinishAgenticJobRunUseCase, Params as FRParams, Output as FROutput } from './use-cases/finish-agentic-job-run.use-case'
import { SyncAgenticJobRunUseCase, Params as SYParams, Output as SYOutput } from './use-cases/sync-agentic-job-run.use-case'
import { SyncAgenticJobRunsUseCase, Params as SYSParams, Output as SYSOutput } from './use-cases/sync-agentic-job-runs.use-case'

export async function createAgenticJob (props: CParams): Promise<COutput> {
    const createAgenticJobUseCase = container.resolve(CreateAgenticJobUseCase)
    return createAgenticJobUseCase.execute(props)
}

export async function updateAgenticJob (props: UParams): Promise<UOutput> {
    const updateAgenticJobUseCase = container.resolve(UpdateAgenticJobUseCase)
    return updateAgenticJobUseCase.execute(props)
}

export async function getAgenticJobById (props: GParams): Promise<GOutput> {
    const getAgenticJobByIdUseCase = container.resolve(GetAgenticJobByIdUseCase)
    return getAgenticJobByIdUseCase.execute(props)
}

export async function listAgenticJobsByUser (props: LParams): Promise<LOutput> {
    const listAgenticJobsByUserUseCase = container.resolve(ListAgenticJobsByUserUseCase)
    return listAgenticJobsByUserUseCase.execute(props)
}

export async function deleteAgenticJob (props: DParams): Promise<DOutput> {
    const deleteAgenticJobUseCase = container.resolve(DeleteAgenticJobUseCase)
    return deleteAgenticJobUseCase.execute(props)
}

export async function previewAgenticJobRuns (props: PParams): Promise<POutput> {
    const previewAgenticJobRunsUseCase = container.resolve(PreviewAgenticJobRunsUseCase)
    return previewAgenticJobRunsUseCase.execute(props)
}

export async function listAgenticJobRunsByJob (props: RJParams): Promise<RJOutput> {
    const listAgenticJobRunsByJobUseCase = container.resolve(ListAgenticJobRunsByJobUseCase)
    return listAgenticJobRunsByJobUseCase.execute(props)
}

export async function listAgenticJobRunsByUser (props: RUParams): Promise<RUOutput> {
    const listAgenticJobRunsByUserUseCase = container.resolve(ListAgenticJobRunsByUserUseCase)
    return listAgenticJobRunsByUserUseCase.execute(props)
}

export async function claimDueAgenticJobs (props: CDParams): Promise<CDOutput> {
    const claimDueAgenticJobsUseCase = container.resolve(ClaimDueAgenticJobsUseCase)
    return claimDueAgenticJobsUseCase.execute(props)
}

export async function startAgenticJobRun (props: SRParams): Promise<SROutput> {
    const startAgenticJobRunUseCase = container.resolve(StartAgenticJobRunUseCase)
    return startAgenticJobRunUseCase.execute(props)
}

export async function finishAgenticJobRun (props: FRParams): Promise<FROutput> {
    const finishAgenticJobRunUseCase = container.resolve(FinishAgenticJobRunUseCase)
    return finishAgenticJobRunUseCase.execute(props)
}

export async function syncAgenticJobRun (props: SYParams): Promise<SYOutput> {
    const syncAgenticJobRunUseCase = container.resolve(SyncAgenticJobRunUseCase)
    return syncAgenticJobRunUseCase.execute(props)
}

export async function syncAgenticJobRuns (props: SYSParams = {}): Promise<SYSOutput> {
    const syncAgenticJobRunsUseCase = container.resolve(SyncAgenticJobRunsUseCase)
    return syncAgenticJobRunsUseCase.execute(props)
}
