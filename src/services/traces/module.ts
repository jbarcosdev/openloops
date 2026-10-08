import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateAgentTracesUseCase, Params as CParams, Output as COutput } from './lambdas/create-agent-traces'
import { ListAgentTracesByChatUseCase, Params as LParams, Output as LOutput } from './lambdas/list-agent-traces-by-chat'

export async function createAgentTraces (props: CParams): Promise<COutput> {
    const createAgentTracesUseCase = container.resolve(CreateAgentTracesUseCase)
    return createAgentTracesUseCase.execute(props)
}

export async function listAgentTracesByChat (props: LParams): Promise<LOutput> {
    const listAgentTracesByChatUseCase = container.resolve(ListAgentTracesByChatUseCase)
    return listAgentTracesByChatUseCase.execute(props)
}
