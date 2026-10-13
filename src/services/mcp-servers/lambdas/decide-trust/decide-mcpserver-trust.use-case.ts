import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { McpServer, McpServerProps } from '../../entities'
import { McpServerRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	decision: 'approve' | 'block'
	manifestHash?: string
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps
}

@autoInjectable()
export class DecideMcpServerTrustUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, decision, manifestHash } = params

		if (decision === 'approve' && !manifestHash) {
			throw new Error('The reviewed manifest hash is required to approve a Mcp Server')
		}

		const found = await this.mcpServerRepository?.findById(id)

		if (!found) {
			throw new Error('Mcp Server not found')
		}

		const mcpServer = McpServer.fromJSON(found)

		if (decision === 'approve') mcpServer.approve(manifestHash!)
		else mcpServer.block()

		mcpServer.setUpdatedBy(params.currentUser)

		const saved = await this.mcpServerRepository?.update(mcpServer, { expectedVersion: found.__v })

		return { data: saved ?? mcpServer.toJSON() }
	}
}
