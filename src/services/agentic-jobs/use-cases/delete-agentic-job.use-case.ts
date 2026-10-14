import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJob, AgenticJobProps } from '../entities'
import { AgenticJobRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobProps | null | undefined
}

@autoInjectable()
export class DeleteAgenticJobUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRepository) private readonly agenticJobRepository?: AgenticJobRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			if (!currentUser?.isAdmin()) this.throwError403()

			const result = await this.agenticJobRepository?.deleteById(id)
			return { data: { deletedCount: result } as any }
		}

		const job = AgenticJob.fromJSON({ _id: id })
		job.setDeletedBy(currentUser)
		job.unset(['nextRunAt'])

		const result = await this.agenticJobRepository?.update(job)

		return { data: result }
	}
}
