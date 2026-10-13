import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServerRepository } from '../../repositories'
import { McpServer, McpServerProps } from '../../entities'
import { VerifyMcpServerConnectionUseCase } from '../verify-connection'

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

		const clean = McpServer.stripSystemFields({ ...payload })

		const existing = await this.mcpServerRepository?.findById(id)

		if (!existing) {
			throw new Error('Mcp Server not found or update failed')
		}

		if (clean.__v !== undefined && clean.__v !== existing.__v) {
			throw new VersionConflictError()
		}

		const endpointChanged = (clean.url !== undefined && clean.url !== existing.url) || (clean.type !== undefined && clean.type !== existing.type)
		const headersChanged = clean.headers !== undefined && JSON.stringify(clean.headers) !== JSON.stringify(existing.headers)

		const mcpServer = McpServer.fromJSON({ ...existing, ...clean, _id: id })
		mcpServer.setUpdatedBy(currentUser)

		if (endpointChanged) {
			mcpServer.lockForNewEndpoint(existing.url)
		}

		const result = await this.mcpServerRepository?.update(mcpServer, { checkVersion: true })

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
