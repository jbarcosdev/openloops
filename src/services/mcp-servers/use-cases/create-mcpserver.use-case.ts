import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServer, McpServerProps } from '../entities'
import { McpServerRepository } from '../repositories'
import { VerifyMcpServerConnectionUseCase } from './verify-mcpserver-connection.use-case'

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
		mcpServer.initialize()

		await this.mcpServerRepository?.create(mcpServer, params.scope ?? Scope.canEdit(currentUser))

		const verified = await this.verifyConnection?.execute({ id: String(mcpServer._id), currentUser })

		return { data: verified?.data ?? mcpServer.toJSON() }
	}
}
