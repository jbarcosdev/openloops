import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServer, McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
    id: string
    payload?: Pick<McpServerProps, 'name' | 'url' | 'headers' | 'enabled' | '__v'>
}

export type Output = McpServerProps

export class UpdateInternalMcpUseCase extends BaseUseCase<Params, Output> {
    constructor (private readonly mcpServerRepository = new McpServerRepository()) {
        super()
    }

    async execute (params: Params): Promise<Output> {
        const { id, payload, currentUser } = params
        const scope = params.scope ?? Scope.asAdmin(currentUser)

        if (!payload || Object.keys(payload).length === 0) this.throwHttpError({ statusCode: 400, errorMessage: 'Payload is required for updating an internal MCP' })

        const existing = await this.mcpServerRepository.findInternalById(id, scope)

        if (!existing) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })
        if (payload.__v !== undefined && payload.__v !== existing.__v) throw new VersionConflictError()

        if (payload.name !== undefined && payload.name !== existing.name) {
            if (!payload.name) this.throwHttpError({ statusCode: 400, errorMessage: 'An internal MCP needs a name and a url' })
            if (await this.mcpServerRepository.findInternalByName(payload.name, scope)) {
                this.throwHttpError({ statusCode: 409, errorMessage: `There is already an internal MCP named "${payload.name}"` })
            }
        }

        if (payload.url !== undefined && !payload.url) this.throwHttpError({ statusCode: 400, errorMessage: 'An internal MCP needs a name and a url' })

        const { name, url, headers, enabled } = payload
        const mcpServer = McpServer.fromJSON({ ...existing, ...(name !== undefined && { name }), ...(url !== undefined && { url }), ...(headers !== undefined && { headers }), ...(enabled !== undefined && { enabled }), _id: id, internal: true })

        const result = await this.mcpServerRepository.update(mcpServer, scope, { expectedVersion: existing.__v })

        if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

        return result
    }
}
