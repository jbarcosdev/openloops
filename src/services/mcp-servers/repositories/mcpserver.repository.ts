import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { secretManager } from '@common/utils/secret-manager'
import { McpServer, McpServerProps } from '../entities'

@autoInjectable()
export class McpServerRepository {
	public readonly _ = new MongoRepository<McpServerProps>({
		database: secretManager.get('OPENLOOPS_DB_NAME'),
		collection: 'mcp_servers',
	})

	public async create (mcpServer: McpServer): Promise<McpServer> {
		const id = await this._.createOne({ payload: mcpServer.toDocument() })
		id && mcpServer.setId(id)
		return mcpServer
	}

	public async update(mcpServer: McpServer): Promise<McpServerProps | null> {
		return await this._.updateOne({
			where: { _id: mcpServer._id },
			payload: mcpServer.toFlatDocument(),
		})
	}

	public async findById(id: string): Promise<McpServerProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: McpServerProps, options?: QueryOptions): Promise<McpServerProps[]> {
		return await this._.findMany({ where, options })
	}
}
