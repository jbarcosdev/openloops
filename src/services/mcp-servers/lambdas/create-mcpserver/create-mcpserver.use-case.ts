import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServer, McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	payload?: McpServerProps
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps | null
}

@autoInjectable()
export class CreateMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const mcpServer = McpServer.fromJSON({ ...payload })
		mcpServer.setCreatedBy(currentUser)
		mcpServer.setOwner(currentUser)

		const result = await this.mcpServerRepository?.create(mcpServer)

		return { data: mcpServer.toJSON() }
	}
}
