import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServer, McpServerProps, McpManifest } from '../../entities'
import { McpServerRepository } from '../../repositories'

const MAX_ATTEMPTS = 3

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: McpServerProps
}

@autoInjectable()
export class VerifyMcpServerConnectionUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(McpServerRepository) private readonly mcpServerRepository?: McpServerRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id } = params

		const found = await this.mcpServerRepository?.findById(id)

		if (!found) {
			throw new Error('Mcp Server not found')
		}

		const probed = McpServer.fromJSON(found)
		let manifest: McpManifest | undefined
		let failure: unknown

		try {
			manifest = await probed.fetchManifest()
		} catch (error) {
			failure = error
		}

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const current = attempt === 1 ? probed : McpServer.fromJSON((await this.mcpServerRepository?.findById(id)) ?? found)

			if (current.url !== probed.url || JSON.stringify(current.headers) !== JSON.stringify(probed.headers)) {
				return { data: current.toJSON() }
			}

			if (manifest) current.addManifest(manifest)
			else current.markError(failure)

			try {
				const saved = await this.mcpServerRepository?.update(current, { checkVersion: true })
				return { data: saved ?? current.toJSON() }
			} catch (error) {
				if (!(error instanceof VersionConflictError) || attempt === MAX_ATTEMPTS) throw error
			}
		}

		throw new VersionConflictError()
	}
}
