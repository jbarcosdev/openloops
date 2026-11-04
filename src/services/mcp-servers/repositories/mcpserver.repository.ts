import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { McpServer, McpServerProps } from '../entities'

export class McpServerRepository {
	public readonly _ = new MongoRepository<McpServerProps>({
		database: getDatabaseName(),
		collection: 'mcp_servers',
		scoped: true,
	})

	public async create (mcpServer: McpServer, scope: Scope): Promise<McpServer> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: mcpServer.toDocument(), scope })
		Object.assign(mcpServer, { _id, ownerId, createdAt, createdBy })
		return mcpServer
	}

	public async update (mcpServer: McpServer, scope: Scope, options?: { expectedVersion?: number }): Promise<McpServerProps | null> {
		if (options && typeof options.expectedVersion !== 'number') throw new Error('[McpServerRepository] The expected version is required to check for conflicts')
		return await this._.updateOne({
			scope,
			where: { _id: mcpServer._id },
			payload: mcpServer.toFlatDocument(),
			expectedVersion: options?.expectedVersion,
		})
	}

	public async findById (id: string, scope: Scope): Promise<McpServerProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findAllByOwner (ownerId: string, scope: Scope): Promise<McpServerProps[]> {
		return await this._.findAll({
			scope,
			where: { ownerId: new ObjectId(ownerId) },
			options: { sortBy: { createdAt: 1, _id: 1 } },
		})
	}

	public async softDeleteById (id: string, scope: Scope): Promise<McpServerProps | null> {
		return await this._.softDelete({ scope, where: { _id: this._.parseId(id) } })
	}

	public async deleteById (id: string, scope: Scope): Promise<number> {
		return await this._.deleteOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: McpServerProps, scope: Scope, options?: QueryOptions): Promise<McpServerProps[]> {
		return await this._.findMany({ scope, where, options })
	}
}
