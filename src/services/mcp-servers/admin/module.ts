import { CreateInternalMcpUseCase, Params as CParams, Output as COutput } from './use-cases/create-internal-mcp.use-case'
import { UpdateInternalMcpUseCase, Params as UParams, Output as UOutput } from './use-cases/update-internal-mcp.use-case'
import { GetInternalMcpByIdUseCase, Params as GParams, Output as GOutput } from './use-cases/get-internal-mcp-by-id.use-case'
import { ListInternalMcpsUseCase, Params as LParams, Output as LOutput } from './use-cases/list-internal-mcps.use-case'
import { DeleteInternalMcpUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-internal-mcp.use-case'

export async function createInternalMcp (props: CParams): Promise<COutput> {
    return new CreateInternalMcpUseCase().execute(props)
}

export async function updateInternalMcp (props: UParams): Promise<UOutput> {
    return new UpdateInternalMcpUseCase().execute(props)
}

export async function getInternalMcpById (props: GParams): Promise<GOutput> {
    return new GetInternalMcpByIdUseCase().execute(props)
}

export async function listInternalMcps (props: LParams): Promise<LOutput> {
    return new ListInternalMcpsUseCase().execute(props)
}

export async function deleteInternalMcp (props: DParams): Promise<DOutput> {
    return new DeleteInternalMcpUseCase().execute(props)
}
