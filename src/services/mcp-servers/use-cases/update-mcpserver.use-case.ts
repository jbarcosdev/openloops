import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServerRepository } from '../repositories'
import { McpServer, McpServerProps } from '../entities'
import { VerifyMcpServerConnectionUseCase } from './verify-mcpserver-connection.use-case'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: McpServerProps
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps
}

@autoInjectable()
export class UpdateMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository,
		@inject(VerifyMcpServerConnectionUseCase) private readonly verifyConnection?: VerifyMcpServerConnectionUseCase,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating Mcp Server')
		}

		const existing = await this.mcpServerRepository?.findById(id)

		if (!existing) {
			throw new Error('Mcp Server not found or update failed')
		}

		if (payload.__v !== undefined && payload.__v !== existing.__v) {
			throw new VersionConflictError()
		}

		const endpointChanged = (payload.url !== undefined && payload.url !== existing.url) || (payload.type !== undefined && payload.type !== existing.type)
		const headersChanged = payload.headers !== undefined && JSON.stringify(payload.headers) !== JSON.stringify(existing.headers)

		const mcpServer = McpServer.fromJSON({ ...existing, ...payload, _id: id, trust: existing.trust, approvedHash: existing.approvedHash, status: existing.status, lastError: existing.lastError, history: existing.history })
		mcpServer.setUpdatedBy(currentUser)

		if (endpointChanged) {
			mcpServer.lockForNewEndpoint()
		}

		const result = await this.mcpServerRepository?.update(mcpServer, { expectedVersion: existing.__v })

		if (!result) {
			throw new Error('Mcp Server not found or update failed')
		}

		if (endpointChanged || headersChanged) {
			const verified = await this.verifyConnection?.execute({ id, currentUser })
			return { data: verified?.data ?? result }
		}

		return { data: result }
	}
}
