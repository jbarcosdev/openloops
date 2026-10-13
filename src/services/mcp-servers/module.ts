import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateMcpServerUseCase, Params as CParams, Output as COutput } from './lambdas/create-mcpserver'
import { UpdateMcpServerUseCase, Params as UParams, Output as UOutput } from './lambdas/update-mcpserver'
import { GetMcpServerByIdUseCase, Params as GParams, Output as GOutput } from './lambdas/get-mcpserver-by-id'
import { ListMcpServersByUserUseCase, Params as LParams, Output as LOutput } from './lambdas/list-mcpservers-by-user'
import { ListAllMcpServersByUserUseCase, Params as AParams, Output as AOutput } from './lambdas/list-all-mcpservers-by-user'
import { DeleteMcpServerUseCase, Params as DParams, Output as DOutput } from './lambdas/delete-mcpserver'
import { DecideMcpServerTrustUseCase, Params as TParams, Output as TOutput } from './lambdas/decide-trust'
import { VerifyMcpServerConnectionUseCase, Params as VParams, Output as VOutput } from './lambdas/verify-connection'

export async function createMcpServer (props: CParams): Promise<COutput> {
    const createMcpServerUseCase = container.resolve(CreateMcpServerUseCase)
    return createMcpServerUseCase.execute(props)
}

export async function updateMcpServer (props: UParams): Promise<UOutput> {
    const updateMcpServerUseCase = container.resolve(UpdateMcpServerUseCase)
    return updateMcpServerUseCase.execute(props)
}

export async function getMcpServerById (props: GParams): Promise<GOutput> {
    const getMcpServerByIdUseCase = container.resolve(GetMcpServerByIdUseCase)
    return getMcpServerByIdUseCase.execute(props)
}

export async function listMcpServersByUser (props: LParams): Promise<LOutput> {
    const listMcpServersByUserUseCase = container.resolve(ListMcpServersByUserUseCase)
    return listMcpServersByUserUseCase.execute(props)
}

export async function listAllMcpServersByUser (props: AParams): Promise<AOutput> {
    const listAllMcpServersByUserUseCase = container.resolve(ListAllMcpServersByUserUseCase)
    return listAllMcpServersByUserUseCase.execute(props)
}

export async function deleteMcpServer (props: DParams): Promise<DOutput> {
    const deleteMcpServerUseCase = container.resolve(DeleteMcpServerUseCase)
    return deleteMcpServerUseCase.execute(props)
}

export async function decideMcpServerTrust (props: TParams): Promise<TOutput> {
    const decideMcpServerTrustUseCase = container.resolve(DecideMcpServerTrustUseCase)
    return decideMcpServerTrustUseCase.execute(props)
}

export async function verifyMcpServerConnection (props: VParams): Promise<VOutput> {
    const verifyMcpServerConnectionUseCase = container.resolve(VerifyMcpServerConnectionUseCase)
    return verifyMcpServerConnectionUseCase.execute(props)
}
