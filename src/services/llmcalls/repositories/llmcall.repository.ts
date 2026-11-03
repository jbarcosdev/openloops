import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions, Scope } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { LLMCall, LLMCallProps } from '../entities'

@autoInjectable()
export class LLMCallRepository {
	public readonly _ = new MongoRepository<LLMCallProps>({
		database: getDatabaseName(),
		collection: 'llm_calls',
		scoped: true,
	})

	public async create (llmCall: LLMCall, scope: Scope): Promise<LLMCall> {
		const { _id, ownerId, createdAt, createdBy } = await this._.createOne({ payload: llmCall.toDocument(), scope })
		Object.assign(llmCall, { _id, ownerId, createdAt, createdBy })
		return llmCall
	}

	public async update (llmCall: LLMCall, scope: Scope): Promise<LLMCallProps | null> {
		return await this._.updateOne({
			scope,
			where: { _id: llmCall._id },
			payload: llmCall.toFlatDocument(),
		})
	}

	public async findById (id: string, scope: Scope): Promise<LLMCallProps | null> {
		return await this._.findOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async softDeleteById (id: string, scope: Scope): Promise<LLMCallProps | null> {
		return await this._.softDelete({ scope, where: { _id: this._.parseId(id) } })
	}

	public async deleteById (id: string, scope: Scope): Promise<number> {
		return await this._.deleteOne({ scope, where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: LLMCallProps, scope: Scope, options?: QueryOptions): Promise<{ items: LLMCallProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ scope, where, options })
	}
}
