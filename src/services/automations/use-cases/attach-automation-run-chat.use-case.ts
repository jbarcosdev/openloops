import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRun, AutomationRunProps } from '../entities'
import { AutomationRunRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	runId: string
	chatId: string
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps | null
}

@autoInjectable()
export class AttachAutomationRunChatUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(AutomationRunRepository) private readonly automationRunRepository?: AutomationRunRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { runId, chatId } = params

		const run = await this.automationRunRepository!.findById(runId)
		if (!run) return { data: null }

		const saved = await this.automationRunRepository!.update(AutomationRun.fromJSON({ ...run, chatId }))

		return { data: saved }
	}
}
