import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServer, McpServerProps, McpSource } from '../../entities'
import { McpServerRepository } from '../../repositories'

const MAX_ATTEMPTS = 3

export interface Params extends BaseUseCaseParams {
	id: string
	decision: 'approve' | 'block'
	source: McpSource
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
		const { id, decision, source, manifestHash } = params

		if (decision === 'approve' && !manifestHash) {
			throw new Error('The reviewed manifest hash is required to approve a Mcp Server')
		}

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const found = await this.mcpServerRepository?.findById(id)

			if (!found) {
				throw new Error('Mcp Server not found')
			}

			const mcpServer = McpServer.fromJSON(found)

			if (decision === 'approve') {
				if (mcpServer.manifest?.hash !== manifestHash) {
					throw new Error('The Mcp Server manifest changed since it was reviewed, review it again')
				}
				mcpServer.approve(source)
			} else {
				mcpServer.block(source)
			}

			mcpServer.setUpdatedBy(params.currentUser)

			try {
				const saved = await this.mcpServerRepository?.update(mcpServer, { checkVersion: true })
				return { data: saved ?? mcpServer.toJSON() }
			} catch (error) {
				if (!(error instanceof VersionConflictError) || attempt === MAX_ATTEMPTS) throw error
			}
		}

		throw new VersionConflictError()
	}
}
