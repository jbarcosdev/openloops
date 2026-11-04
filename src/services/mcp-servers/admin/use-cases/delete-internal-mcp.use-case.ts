import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
    id: string
}

export interface Output {
    deletedCount: number
}

export class DeleteInternalMcpUseCase extends BaseUseCase<Params, Output> {
    constructor (private readonly mcpServerRepository = new McpServerRepository()) {
        super()
    }

    async execute (params: Params): Promise<Output> {
        const { id, currentUser } = params
        if (!id) throw new Error('Missing id')

        const deletedCount = await this.mcpServerRepository.deleteInternalById(id, params.scope ?? Scope.asAdmin(currentUser))
        if (!deletedCount) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

        return { deletedCount }
    }
}
