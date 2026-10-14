import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AgenticJobRun, AgenticJobRunProps } from '../entities'
import { AgenticJobRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	runId: string
	chatId: string
}

export interface Output extends BaseUseCaseOutput {
	data: AgenticJobRunProps | null
}

@autoInjectable()
export class AttachAgenticJobRunChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AgenticJobRunRepository) private readonly agenticJobRunRepository?: AgenticJobRunRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { runId, chatId } = params

		const run = await this.agenticJobRunRepository!.findById(runId)
		if (!run) return { data: null }

		const saved = await this.agenticJobRunRepository!.update(AgenticJobRun.fromJSON({ ...run, chatId }))

		return { data: saved }
	}
}
