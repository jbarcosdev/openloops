import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServerRepository } from '../repositories'
import { McpServerProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export type Output = McpServerProps | null

export class GetMcpServerByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository = new McpServerRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.mcpServerRepository.findById(id, params.scope ?? Scope.canView(currentUser))

		return result
	}
}
