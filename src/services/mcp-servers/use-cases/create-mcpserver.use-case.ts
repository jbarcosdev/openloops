import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServer, McpServerProps } from '../entities'
import { McpServerRepository } from '../repositories'
import { VerifyMcpServerConnectionUseCase } from './verify-mcpserver-connection.use-case'

export interface Params extends BaseUseCaseParams {
	payload?: McpServerProps
}

export type Output = McpServerProps | null

export class CreateMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (
		private readonly mcpServerRepository = new McpServerRepository(),
		private readonly verifyConnection = new VerifyMcpServerConnectionUseCase(),
	) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params

		const mcpServer = McpServer.fromJSON({ ...payload })
		mcpServer.initialize()

		await this.mcpServerRepository.create(mcpServer, params.scope ?? Scope.canEdit(currentUser))

		return await this.verifyConnection.execute({ id: String(mcpServer._id), currentUser })
	}
}
