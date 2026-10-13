import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServer, McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'
import { VerifyMcpServerConnectionUseCase } from '../verify-connection'

export interface Params extends BaseUseCaseParams {
	payload?: McpServerProps
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps | null
}

@autoInjectable()
export class CreateMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (
		@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository,
		@inject(VerifyMcpServerConnectionUseCase) private readonly verifyConnection?: VerifyMcpServerConnectionUseCase,
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const mcpServer = McpServer.fromJSON({ ...payload })
		mcpServer.setCreatedBy(currentUser)
		mcpServer.setOwner(currentUser)
		mcpServer.initialize()

		await this.mcpServerRepository?.create(mcpServer)

		const verified = await this.verifyConnection?.execute({ id: String(mcpServer._id), currentUser })

		return { data: verified?.data ?? mcpServer.toJSON() }
	}
}
