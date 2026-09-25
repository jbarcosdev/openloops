import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { secretManager } from '@common/utils/secret-manager'
import { User, UserProps } from '../entities'

@autoInjectable()
export class UserRepository {
	public readonly _ = new MongoRepository<UserProps>({
		database: secretManager.get('OPENLOOPS_DB_NAME'),
		collection: 'users',
	})

	public async create (user: User): Promise<User> {
		const id = await this._.createOne({ payload: user.toDocument() })
		id && user.setId(id)
		return user
	}

	public async update (user: User): Promise<UserProps | null> {
		const { password, ...rest } = await this._.updateOne({
			payload: user.toFlatDocument(),
			where: { _id: user._id }
		})
		return rest
	}

	public async findById (id: string): Promise<UserProps | null> {
		return await this._.findOne({
			where: { _id: this._.parseId(id) },
			select: { password: 0 }
		})
	}

	public async findByExternalId (id: string): Promise<UserProps | null> {
		// TODO: implement
		return null
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: Partial<UserProps>, options: QueryOptions): Promise<UserProps[]> {
		return await this._.findMany({ where, select: { password: 0 }, options })
	}

	public async findByEmailOrUsernameWithPassword (emailOrUsername: string): Promise<User | null> {
		const input = this._.cleanInput(emailOrUsername)

		const user = await this._.findOne({
			where: { $or: [{ email: input }, { username: input }] } as any
		})
		if (!user) return null

		return await User.create(user)
	}
}
