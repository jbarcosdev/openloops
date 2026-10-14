import { autoInjectable } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { McpServer, McpServerProps } from '../entities'

@autoInjectable()
export class McpServerRepository {
	public readonly _ = new MongoRepository<McpServerProps>({
		database: getDatabaseName(),
		collection: 'mcp_servers',
	})

	public async create (mcpServer: McpServer): Promise<McpServer> {
		const id = await this._.createOne({ payload: mcpServer.toDocument() })
		id && mcpServer.setId(id)
		return mcpServer
	}

	public async update(mcpServer: McpServer, options?: { expectedVersion?: number }): Promise<McpServerProps | null> {
		if (options && typeof options.expectedVersion !== 'number') throw new Error('[McpServerRepository] The expected version is required to check for conflicts')
		return await this._.updateOne({
			where: { _id: mcpServer._id },
			payload: mcpServer.toFlatDocument(),
			expectedVersion: options?.expectedVersion,
		})
	}

	public async findById(id: string): Promise<McpServerProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async findAllByOwner (ownerId: string): Promise<McpServerProps[]> {
		return await this._.findAll({
			where: { ownerId: new ObjectId(ownerId) },
			options: { sortBy: { createdAt: 1, _id: 1 } },
		})
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: McpServerProps, options?: QueryOptions): Promise<McpServerProps[]> {
		return await this._.findMany({ where, options })
	}
}
