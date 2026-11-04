import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServerRepository } from '../repositories'
import { McpServer, McpServerProps } from '../entities'
import { VerifyMcpServerConnectionUseCase } from './verify-mcpserver-connection.use-case'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: McpServerProps
}

export type Output = McpServerProps

export class UpdateMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly mcpServerRepository = new McpServerRepository(),
		private readonly verifyConnection = new VerifyMcpServerConnectionUseCase(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating Mcp Server')
		}

		const scope = params.scope ?? Scope.canEdit(currentUser)
		const existing = await this.mcpServerRepository.findById(id, scope)

		if (!existing) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		if (payload.__v !== undefined && payload.__v !== existing.__v) {
			throw new VersionConflictError()
		}

		const endpointChanged = (payload.url !== undefined && payload.url !== existing.url) || (payload.type !== undefined && payload.type !== existing.type)
		const headersChanged = payload.headers !== undefined && JSON.stringify(payload.headers) !== JSON.stringify(existing.headers)

		const mcpServer = McpServer.fromJSON({ ...existing, ...payload, _id: id, trust: existing.trust, approvedHash: existing.approvedHash, status: existing.status, lastError: existing.lastError, history: existing.history })

		if (endpointChanged) {
			mcpServer.lockForNewEndpoint()
		}

		const result = await this.mcpServerRepository.update(mcpServer, scope, { expectedVersion: existing.__v })

		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		if (endpointChanged || headersChanged) {
			return await this.verifyConnection.execute({ id, currentUser })
		}

		return result
	}
}
