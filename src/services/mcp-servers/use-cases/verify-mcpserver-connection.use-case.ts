import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { VersionConflictError } from '@common/repositories/mongo-db.repository'
import { McpServer, McpServerProps, McpManifest } from '../entities'
import { McpServerRepository } from '../repositories'

const MAX_ATTEMPTS = 3

export interface Params extends BaseUseCaseParams {
	id: string
}

export type Output = McpServerProps

export class VerifyMcpServerConnectionUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly mcpServerRepository = new McpServerRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const scope = params.scope ?? Scope.canEdit(currentUser)

		const found = await this.mcpServerRepository.findById(id, scope)

		if (!found) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		const probed = McpServer.fromJSON(found)
		let manifest: McpManifest | undefined
		let failure: unknown

		try {
			manifest = await probed.fetchManifest()
		} catch (error) {
			failure = error
		}

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const current = attempt === 1 ? probed : McpServer.fromJSON((await this.mcpServerRepository.findById(id, scope)) ?? found)

			if (current.url !== probed.url || JSON.stringify(current.headers) !== JSON.stringify(probed.headers)) {
				return current.toJSON()
			}

			if (manifest) current.addManifest(manifest)
			else current.markError(failure)

			try {
				const saved = await this.mcpServerRepository.update(current, scope, { expectedVersion: current.__v })
				return saved ?? current.toJSON()
			} catch (error) {
				if (!(error instanceof VersionConflictError) || attempt === MAX_ATTEMPTS) throw error
			}
		}

		throw new VersionConflictError()
	}
}
