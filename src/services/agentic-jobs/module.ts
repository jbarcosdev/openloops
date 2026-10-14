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
