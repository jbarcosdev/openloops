import { autoInjectable } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { MongoRepository, QueryOptions } from '@common/repositories'
import { getDatabaseName } from '@common/utils/database-name'
import { AgenticJobRun, AgenticJobRunProps, AgenticJobRunStatus } from '../entities'

@autoInjectable()
export class AgenticJobRunRepository {
	public readonly _ = new MongoRepository<AgenticJobRunProps>({
		database: getDatabaseName(),
		collection: 'agentic_job_runs',
	})

	public async create (run: AgenticJobRun): Promise<AgenticJobRun> {
		const id = await this._.createOne({ payload: run.toDocument() })
		id && run.setId(id)
		return run
	}

	public async update (run: AgenticJobRun): Promise<AgenticJobRunProps | null> {
		return await this._.updateOne({
			where: { _id: run._id },
			payload: run.toFlatDocument(),
		})
	}

	public async findById (id: string): Promise<AgenticJobRunProps | null> {
		return await this._.findOne({ where: { _id: this._.parseId(id) } })
	}

	public async findByJob (jobId: string, options?: QueryOptions): Promise<AgenticJobRunProps[]> {
		return await this._.findMany({ where: { jobId: new ObjectId(jobId) }, options })
	}

	public async findByOwner (ownerId: string, options?: QueryOptions, status?: AgenticJobRunStatus): Promise<AgenticJobRunProps[]> {
		return await this._.findMany({ where: { ownerId: new ObjectId(ownerId), ...(status ? { status } : {}) }, options })
	}

	public async findByStatus (status: AgenticJobRunStatus, limit: number): Promise<AgenticJobRunProps[]> {
		return await this._.findMany({ where: { status }, options: { page: 1, limit, sortBy: { createdAt: 1 } } })
	}
}
