import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServerRepository } from '../../repositories'
import { McpServer, McpServerProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: McpServerProps
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps
}

@autoInjectable()
export class UpdateMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating Mcp Server')
		}

		const mcpServer = McpServer.fromJSON({ ...payload, _id: id })
		mcpServer.setUpdatedBy(currentUser)

		const result = await this.mcpServerRepository?.update(mcpServer)

		if (!result) {
			throw new Error('Mcp Server not found or update failed')
		}

		return { data: result }
	}
}
