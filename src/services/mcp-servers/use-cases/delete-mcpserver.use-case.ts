import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServer, McpServerProps } from '../entities'
import { McpServerRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps | null | undefined
}

@autoInjectable()
export class DeleteMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			const result = await this.mcpServerRepository?.deleteById(id, params.scope ?? Scope.asAdmin(currentUser))
			return { data: { deletedCount: result } as any }
		}

		const result = await this.mcpServerRepository?.softDeleteById(id, params.scope ?? Scope.canManage(currentUser))
		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
