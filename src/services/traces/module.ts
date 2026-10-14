import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateAgentTracesUseCase, Params as CParams, Output as COutput } from './use-cases/create-agent-traces.use-case'
import { ListAgentTracesByChatUseCase, Params as LParams, Output as LOutput } from './use-cases/list-agent-traces-by-chat.use-case'

export async function createAgentTraces (props: CParams): Promise<COutput> {
    const createAgentTracesUseCase = container.resolve(CreateAgentTracesUseCase)
    return createAgentTracesUseCase.execute(props)
}

export async function listAgentTracesByChat (props: LParams): Promise<LOutput> {
    const listAgentTracesByChatUseCase = container.resolve(ListAgentTracesByChatUseCase)
    return listAgentTracesByChatUseCase.execute(props)
}
