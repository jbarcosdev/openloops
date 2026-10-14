import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobRepository } from '../repositories'
import { leaseMs as defaultLeaseMs } from '../utils/settings'

export interface Params extends BaseUseCaseParams {
	jobId: string
	workerId: string
	leaseMs?: number
	now?: Date
}

export interface Output extends BaseUseCaseOutput {
	data: { renewed: boolean }
}

@autoInjectable()
export class RenewAgenticJobLeaseUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { jobId, workerId } = params
		const now = params.now ?? new Date()
		const until = new Date(now.getTime() + (params.leaseMs ?? defaultLeaseMs()))

		const job = await this.agenticJobRepository!.renewLease(jobId, workerId, until)

		return { data: { renewed: Boolean(job) } }
	}
}
