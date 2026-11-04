import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
    options?: QueryOptions
}

export interface Output {
    items: McpServerProps[]
    hasMore: boolean
}

export class ListInternalMcpsUseCase extends BaseUseCase<Params, Output> {
    constructor (private readonly mcpServerRepository = new McpServerRepository()) {
        super()
    }

    async execute (params: Params): Promise<Output> {
        const { options, currentUser } = params
        const { page = 1, limit = 10 } = options || {}

        return await this.mcpServerRepository.findInternalPage(params.scope ?? Scope.asAdmin(currentUser), { page, limit, sortBy: { updatedAt: -1 } })
    }
}
