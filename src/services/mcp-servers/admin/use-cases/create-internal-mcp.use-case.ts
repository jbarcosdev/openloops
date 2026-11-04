import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServer, McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
    payload?: Pick<McpServerProps, 'name' | 'url' | 'headers' | 'enabled' | 'environment'>
}

export type Output = McpServerProps

export class CreateInternalMcpUseCase extends BaseUseCase<Params, Output> {
    constructor (private readonly mcpServerRepository = new McpServerRepository()) {
        super()
    }

    async execute (params: Params): Promise<Output> {
        const { payload, currentUser } = params
        const scope = params.scope ?? Scope.asAdmin(currentUser)

        if (!payload?.name || !payload?.url) this.throwHttpError({ statusCode: 400, errorMessage: 'An internal MCP needs a name and a url' })

        if (await this.mcpServerRepository.findInternalByName(payload.name, scope)) {
            this.throwHttpError({ statusCode: 409, errorMessage: `There is already an internal MCP named "${payload.name}"` })
        }

        const { name, url, headers, enabled, environment } = payload
        const mcpServer = McpServer.fromJSON({ name, url, headers, enabled, environment, type: 'http' }).initializeInternal()

        await this.mcpServerRepository.create(mcpServer, scope)

        return mcpServer.toJSON()
    }
}
