import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, QueryParams } from '@common/repositories'
import { secretManager } from '@common/utils/secret-manager'
import { Chat, ChatProps } from '../entities'

@autoInjectable()
export class ChatRepository {
	public readonly _ = new MongoRepository<ChatProps>({
		database: secretManager.get('OPENLOOPS_DB_NAME'),
		collection: 'chats',
	})

	public async create (chat: Chat): Promise<Chat> {
		const id = await this._.createOne({ payload: chat.toDocument() })
		id && chat.setId(id)
		return chat
	}

	public async update(chat: Chat): Promise<ChatProps | null> {
		return await this._.updateOne({
			where: { _id: chat._id },
			payload: chat.toFlatDocument(),
		})
	}

	public async findById(id: string, select?: QueryParams<ChatProps>['select']): Promise<ChatProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) }, select })
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: ChatProps, options: QueryOptions): Promise<ChatProps[]> {
		return await this._.findMany({ where, options })
	}
}
