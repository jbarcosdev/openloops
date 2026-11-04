import { entityPatch } from '@common/base/utils'
import { MongoRepository, QueryOptions, QueryParams, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { Chat, ChatProps } from '../entities'

export class ChatRepository {
	public readonly _ = new MongoRepository<ChatProps>({
		database: getDatabaseName(),
		collection: 'chats',
		scoped: true,
	})

	public async create (chat: Chat, scope: Scope): Promise<Chat> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: chat.toJSON(), scope })
		Object.assign(chat, { _id, ownerId, createdAt, createdBy })
		return chat
	}

	public async update (chat: Chat, scope: Scope): Promise<ChatProps | null> {
		return await this._.patchOne({ scope, where: { _id: chat._id }, ...entityPatch(chat) })
	}

	public async findById (id: string, scope: Scope, select?: QueryParams<ChatProps>['select']): Promise<ChatProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) }, select })
	}

	public async softDeleteById (id: string, scope: Scope): Promise<ChatProps | null> {
		return await this._.softDelete({ scope, where: { _id: this._.parseId(id) } })
	}

	public async deleteById (id: string, scope: Scope): Promise<number> {
		return await this._.deleteOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: ChatProps, options: QueryOptions, scope: Scope): Promise<{ items: ChatProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, options })
	}
}
