import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServer, McpServerProps } from '../entities'
import { McpServerRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export type Output = McpServerProps | null | { deletedCount: number }

export class DeleteMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository = new McpServerRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			const result = await this.mcpServerRepository.deleteById(id, params.scope ?? Scope.asAdmin(currentUser))
			return { deletedCount: result }
		}

		const result = await this.mcpServerRepository.softDeleteById(id, params.scope ?? Scope.canManage(currentUser))
		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
