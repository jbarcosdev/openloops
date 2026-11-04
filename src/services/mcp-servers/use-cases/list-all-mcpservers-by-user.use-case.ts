import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServerRepository } from '../repositories'
import { McpServerProps } from '../entities'

export interface Params extends BaseUseCaseParams {}

export interface Output {
	items: McpServerProps[]
	hasMore: boolean
}

export class ListAllMcpServersByUserUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository = new McpServerRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { currentUser } = params

		if (!currentUser?.userId) throw new Error('CurrentUser is required to list the Mcp Servers')

		const results = await this.mcpServerRepository.findAllByOwner(currentUser.userId, params.scope ?? Scope.canView(currentUser))

		return { items: results ?? [], hasMore: false }
	}
}
