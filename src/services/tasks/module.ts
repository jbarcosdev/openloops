import { CreateAgentTaskUseCase, Params as CTParams, Output as CTOutput } from './use-cases/create-agent-task.use-case'
import { UpdateAgentTaskUseCase, Params as UTParams, Output as UTOutput } from './use-cases/update-agent-task.use-case'
import { GetAgentTaskByIdUseCase, Params as GTParams, Output as GTOutput } from './use-cases/get-agent-task-by-id.use-case'
import { ListAgentTasksByChatUseCase, Params as LTParams, Output as LTOutput } from './use-cases/list-agent-tasks-by-chat.use-case'
import { CreateAgentActionUseCase, Params as CAParams, Output as CAOutput } from './use-cases/create-agent-action.use-case'
import { UpdateAgentActionUseCase, Params as UAParams, Output as UAOutput } from './use-cases/update-agent-action.use-case'
import { ListAgentActionsByTaskUseCase, Params as LAParams, Output as LAOutput } from './use-cases/list-agent-actions-by-task.use-case'

export async function createAgentTask (props: CTParams): Promise<CTOutput> {
    const createAgentTaskUseCase = new CreateAgentTaskUseCase()
    return createAgentTaskUseCase.execute(props)
}

export async function updateAgentTask (props: UTParams): Promise<UTOutput> {
    const updateAgentTaskUseCase = new UpdateAgentTaskUseCase()
    return updateAgentTaskUseCase.execute(props)
}

export async function getAgentTaskById (props: GTParams): Promise<GTOutput> {
    const getAgentTaskByIdUseCase = new GetAgentTaskByIdUseCase()
    return getAgentTaskByIdUseCase.execute(props)
}

export async function listAgentTasksByChat (props: LTParams): Promise<LTOutput> {
    const listAgentTasksByChatUseCase = new ListAgentTasksByChatUseCase()
    return listAgentTasksByChatUseCase.execute(props)
}

export async function createAgentAction (props: CAParams): Promise<CAOutput> {
    const createAgentActionUseCase = new CreateAgentActionUseCase()
    return createAgentActionUseCase.execute(props)
}

export async function updateAgentAction (props: UAParams): Promise<UAOutput> {
    const updateAgentActionUseCase = new UpdateAgentActionUseCase()
    return updateAgentActionUseCase.execute(props)
}

export async function listAgentActionsByTask (props: LAParams): Promise<LAOutput> {
    const listAgentActionsByTaskUseCase = new ListAgentActionsByTaskUseCase()
    return listAgentActionsByTaskUseCase.execute(props)
}
