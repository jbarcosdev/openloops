import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServerRepository } from '../../repositories'
import { McpServerProps } from '../../entities'

export interface Params extends BaseUseCaseParams {}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps[]
}

@autoInjectable()
export class ListAllMcpServersByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to list the Mcp Servers')

		const results = await this.mcpServerRepository?.findAllByOwner(currentUser.userId)

		return { data: results ?? [] }
	}
}
