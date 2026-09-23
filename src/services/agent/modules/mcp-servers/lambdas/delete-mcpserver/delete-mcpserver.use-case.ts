import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { McpServer, McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps | null
}

@autoInjectable()
export class DeleteMcpServerUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			if (!currentUser?.isAdmin()) this.throwError403()

			const result = await this.mcpServerRepository.deleteById(id)
			return { data: { deletedCount: result } as any }
		}

		// soft delete
		const mcpServer = McpServer.fromJSON({ _id: id })
		mcpServer.setDeletedBy(currentUser)
		const result = await this.mcpServerRepository.update(mcpServer)

		return { data: result }
	}
}
