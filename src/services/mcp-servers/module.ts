import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateMcpServerUseCase, Params as CParams, Output as COutput } from './use-cases/create-mcpserver.use-case'
import { UpdateMcpServerUseCase, Params as UParams, Output as UOutput } from './use-cases/update-mcpserver.use-case'
import { GetMcpServerByIdUseCase, Params as GParams, Output as GOutput } from './use-cases/get-mcpserver-by-id.use-case'
import { ListMcpServersByUserUseCase, Params as LParams, Output as LOutput } from './use-cases/list-mcpservers-by-user.use-case'
import { ListAllMcpServersByUserUseCase, Params as AParams, Output as AOutput } from './use-cases/list-all-mcpservers-by-user.use-case'
import { DeleteMcpServerUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-mcpserver.use-case'
import { DecideMcpServerTrustUseCase, Params as TParams, Output as TOutput } from './use-cases/decide-mcpserver-trust.use-case'
import { VerifyMcpServerConnectionUseCase, Params as VParams, Output as VOutput } from './use-cases/verify-mcpserver-connection.use-case'

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
