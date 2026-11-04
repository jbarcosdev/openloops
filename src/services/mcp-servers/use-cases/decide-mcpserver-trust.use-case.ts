import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { McpServer, McpServerProps } from '../entities'
import { McpServerRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	decision: 'approve' | 'block'
	manifestHash?: string
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps
}

export class DecideMcpServerTrustUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository = new McpServerRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, decision, manifestHash, currentUser } = params
		const scope = params.scope ?? Scope.canEdit(currentUser)

		if (decision === 'approve' && !manifestHash) {
			throw new Error('The reviewed manifest hash is required to approve a Mcp Server')
		}

		const found = await this.mcpServerRepository.findById(id, scope)

		if (!found) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		const mcpServer = McpServer.fromJSON(found)

		if (decision === 'approve') mcpServer.approve(manifestHash!)
		else mcpServer.block()

		const saved = await this.mcpServerRepository.update(mcpServer, scope, { expectedVersion: found.__v })

		return { data: saved ?? mcpServer.toJSON() }
	}
}
