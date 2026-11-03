import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { User, UserProps } from '../entities'

@autoInjectable()
export class UserRepository {
	public readonly _ = new MongoRepository<UserProps>({
		database: getDatabaseName(),
		collection: 'users',
		scoped: true,
		ownerField: '_id',
		protectedFields: ['role'],
	})

	public async create (user: User, scope: Scope): Promise<User> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: user.toDocument(), scope })
		Object.assign(user, { _id, ownerId, createdAt, createdBy })
		return user
	}

	public async update (user: User, scope: Scope): Promise<UserProps | null> {
		const updated = await this._.updateOne({
			scope,
			payload: user.toFlatDocument(),
			where: { _id: user._id }
		})
		if (!updated) return null
		const { password, ...rest } = updated
		return rest
	}

	public async findById (id: string, scope: Scope): Promise<UserProps | null> {
		return await this._.findOne({
			scope,
			where: { _id: this._.parseId(id) },
			select: { password: 0 }
		})
	}

	public async findByExternalId (id: string): Promise<UserProps | null> {
		// TODO: implement
		return null
	}

	public async softDeleteById (id: string, scope: Scope, deletedReason?: string): Promise<UserProps | null> {
		const deleted = await this._.softDelete({ scope, where: { _id: this._.parseId(id) }, payload: { deletedReason } })
		if (!deleted) return null
		const { password, ...rest } = deleted
		return rest
	}

	public async deleteById (id: string, scope: Scope): Promise<number> {
		return await this._.deleteOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: Partial<UserProps>, options: QueryOptions, scope: Scope): Promise<{ items: UserProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, select: { password: 0 }, options })
	}

	public async findByEmailOrUsernameWithPassword (emailOrUsername: string, scope: Scope): Promise<User | null> {
		const input = this._.cleanInput(emailOrUsername)

		const user = await this._.findOne({
			scope,
			where: { $or: [{ email: input }, { username: input }] } as any
		})
		if (!user) return null

		return await User.create(user)
	}
}
