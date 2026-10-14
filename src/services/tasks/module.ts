import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateAgentTaskUseCase, Params as CTParams, Output as CTOutput } from './use-cases/create-agent-task.use-case'
import { UpdateAgentTaskUseCase, Params as UTParams, Output as UTOutput } from './use-cases/update-agent-task.use-case'
import { GetAgentTaskByIdUseCase, Params as GTParams, Output as GTOutput } from './use-cases/get-agent-task-by-id.use-case'
import { ListAgentTasksByChatUseCase, Params as LTParams, Output as LTOutput } from './use-cases/list-agent-tasks-by-chat.use-case'
import { CreateAgentActionUseCase, Params as CAParams, Output as CAOutput } from './use-cases/create-agent-action.use-case'
import { UpdateAgentActionUseCase, Params as UAParams, Output as UAOutput } from './use-cases/update-agent-action.use-case'
import { ListAgentActionsByTaskUseCase, Params as LAParams, Output as LAOutput } from './use-cases/list-agent-actions-by-task.use-case'

export async function createAgentTask (props: CTParams): Promise<CTOutput> {
    const createAgentTaskUseCase = container.resolve(CreateAgentTaskUseCase)
    return createAgentTaskUseCase.execute(props)
}

export async function updateAgentTask (props: UTParams): Promise<UTOutput> {
    const updateAgentTaskUseCase = container.resolve(UpdateAgentTaskUseCase)
    return updateAgentTaskUseCase.execute(props)
}

export async function getAgentTaskById (props: GTParams): Promise<GTOutput> {
    const getAgentTaskByIdUseCase = container.resolve(GetAgentTaskByIdUseCase)
    return getAgentTaskByIdUseCase.execute(props)
}

export async function listAgentTasksByChat (props: LTParams): Promise<LTOutput> {
    const listAgentTasksByChatUseCase = container.resolve(ListAgentTasksByChatUseCase)
    return listAgentTasksByChatUseCase.execute(props)
}

export async function createAgentAction (props: CAParams): Promise<CAOutput> {
    const createAgentActionUseCase = container.resolve(CreateAgentActionUseCase)
    return createAgentActionUseCase.execute(props)
}

export async function updateAgentAction (props: UAParams): Promise<UAOutput> {
    const updateAgentActionUseCase = container.resolve(UpdateAgentActionUseCase)
    return updateAgentActionUseCase.execute(props)
}

export async function listAgentActionsByTask (props: LAParams): Promise<LAOutput> {
    const listAgentActionsByTaskUseCase = container.resolve(ListAgentActionsByTaskUseCase)
    return listAgentActionsByTaskUseCase.execute(props)
}
