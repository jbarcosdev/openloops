import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
    id: string
}

export type Output = McpServerProps | null

export class GetInternalMcpByIdUseCase extends BaseUseCase<Params, Output> {
    constructor (private readonly mcpServerRepository = new McpServerRepository()) {
        super()
    }

    async execute (params: Params): Promise<Output> {
        const { id, currentUser } = params

        return await this.mcpServerRepository.findInternalById(id, params.scope ?? Scope.asAdmin(currentUser))
    }
}
