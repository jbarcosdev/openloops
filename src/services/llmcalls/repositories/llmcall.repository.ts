import { autoInjectable } from 'tsyringe'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { LLMCall, LLMCallProps } from '../entities'

@autoInjectable()
export class LLMCallRepository {
	public readonly _ = new MongoRepository<LLMCallProps>({
		database: getDatabaseName(),
		collection: 'llm_calls',
	})

	public async create (llmCall: LLMCall): Promise<LLMCall> {
		const { _id } = await this._.createOne({ payload: llmCall.toDocument() })
		llmCall.setId(_id)
		return llmCall
	}

	public async update(llmCall: LLMCall): Promise<LLMCallProps | null> {
		return await this._.updateOne({
			where: { _id: llmCall._id },
			payload: llmCall.toFlatDocument(),
		})
	}

	public async findById(id: string): Promise<LLMCallProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async deleteById (id: string): Promise<number> {
		return await this._.deleteOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByProps (where: LLMCallProps, options?: QueryOptions): Promise<{ items: LLMCallProps[], hasMore: boolean }> {
		return await this._.findManyPaginated({ where, options })
	}
}
