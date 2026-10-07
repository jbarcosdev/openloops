import 'reflect-metadata'
import { container } from 'tsyringe'
import { SaveWorkspaceItemUseCase, Params as SParams, Output as SOutput } from './lambdas/save-workspace-item'
import { GetWorkspaceItemUseCase, Params as GParams, Output as GOutput } from './lambdas/get-workspace-item'
import { ListWorkspaceItemsUseCase, Params as LParams, Output as LOutput } from './lambdas/list-workspace-items'
import { SearchWorkspaceItemsUseCase, Params as QParams, Output as QOutput } from './lambdas/search-workspace-items'
import { DeleteWorkspaceItemUseCase, Params as DParams, Output as DOutput } from './lambdas/delete-workspace-item'

export async function saveWorkspaceItem (props: SParams): Promise<SOutput> {
    const saveWorkspaceItemUseCase = container.resolve(SaveWorkspaceItemUseCase)
    return saveWorkspaceItemUseCase.execute(props)
}

export async function getWorkspaceItem (props: GParams): Promise<GOutput> {
    const getWorkspaceItemUseCase = container.resolve(GetWorkspaceItemUseCase)
    return getWorkspaceItemUseCase.execute(props)
}

export async function listWorkspaceItems (props: LParams): Promise<LOutput> {
    const listWorkspaceItemsUseCase = container.resolve(ListWorkspaceItemsUseCase)
    return listWorkspaceItemsUseCase.execute(props)
}

export async function searchWorkspaceItems (props: QParams): Promise<QOutput> {
    const searchWorkspaceItemsUseCase = container.resolve(SearchWorkspaceItemsUseCase)
    return searchWorkspaceItemsUseCase.execute(props)
}

export async function deleteWorkspaceItem (props: DParams): Promise<DOutput> {
    const deleteWorkspaceItemUseCase = container.resolve(DeleteWorkspaceItemUseCase)
    return deleteWorkspaceItemUseCase.execute(props)
}
