import 'reflect-metadata'
import { container } from 'tsyringe'
import { CreateAgentTaskUseCase, Params as CTParams, Output as CTOutput } from './lambdas/create-agent-task'
import { UpdateAgentTaskUseCase, Params as UTParams, Output as UTOutput } from './lambdas/update-agent-task'
import { GetAgentTaskByIdUseCase, Params as GTParams, Output as GTOutput } from './lambdas/get-agent-task-by-id'
import { ListAgentTasksByChatUseCase, Params as LTParams, Output as LTOutput } from './lambdas/list-agent-tasks-by-chat'
import { CreateAgentActionUseCase, Params as CAParams, Output as CAOutput } from './lambdas/create-agent-action'
import { UpdateAgentActionUseCase, Params as UAParams, Output as UAOutput } from './lambdas/update-agent-action'
import { ListAgentActionsByTaskUseCase, Params as LAParams, Output as LAOutput } from './lambdas/list-agent-actions-by-task'

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
