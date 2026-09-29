import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServerRepository } from '../../repositories'
import { McpServerProps } from '../../entities'

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
		const { id } = params
		const result = await this.mcpServerRepository?.findById(id)

		return { data: result }
	}
}
