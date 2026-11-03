import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServerRepository } from '../repositories'
import { McpServerProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps | null | undefined
}

@autoInjectable()
export class GetMcpServerByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.mcpServerRepository?.findById(id, params.scope ?? Scope.canView(currentUser))

		return { data: result }
	}
}
