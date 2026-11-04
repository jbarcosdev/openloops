import { SaveWorkspaceItemUseCase, Params as SParams, Output as SOutput } from './use-cases/save-workspace-item.use-case'
import { GetWorkspaceItemUseCase, Params as GParams, Output as GOutput } from './use-cases/get-workspace-item.use-case'
import { ListWorkspaceItemsUseCase, Params as LParams, Output as LOutput } from './use-cases/list-workspace-items.use-case'
import { SearchWorkspaceItemsUseCase, Params as QParams, Output as QOutput } from './use-cases/search-workspace-items.use-case'
import { DeleteWorkspaceItemUseCase, Params as DParams, Output as DOutput } from './use-cases/delete-workspace-item.use-case'

export async function saveWorkspaceItem (props: SParams): Promise<SOutput> {
    const saveWorkspaceItemUseCase = new SaveWorkspaceItemUseCase()
    return saveWorkspaceItemUseCase.execute(props)
}

export async function getWorkspaceItem (props: GParams): Promise<GOutput> {
    const getWorkspaceItemUseCase = new GetWorkspaceItemUseCase()
    return getWorkspaceItemUseCase.execute(props)
}

export async function listWorkspaceItems (props: LParams): Promise<LOutput> {
    const listWorkspaceItemsUseCase = new ListWorkspaceItemsUseCase()
    return listWorkspaceItemsUseCase.execute(props)
}

export async function searchWorkspaceItems (props: QParams): Promise<QOutput> {
    const searchWorkspaceItemsUseCase = new SearchWorkspaceItemsUseCase()
    return searchWorkspaceItemsUseCase.execute(props)
}

export async function deleteWorkspaceItem (props: DParams): Promise<DOutput> {
    const deleteWorkspaceItemUseCase = new DeleteWorkspaceItemUseCase()
    return deleteWorkspaceItemUseCase.execute(props)
}
