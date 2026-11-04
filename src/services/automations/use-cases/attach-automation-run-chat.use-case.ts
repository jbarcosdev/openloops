import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { AutomationRun, AutomationRunProps } from '../entities'
import { AutomationRunRepository } from '../repositories'
import { runnerScope } from '../utils/runner-scope'

export interface Params extends BaseUseCaseParams {
	runId: string
	chatId: string
}

export interface Output extends BaseUseCaseOutput {
	data: AutomationRunProps | null
}

export class AttachAutomationRunChatUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly automationRunRepository = new AutomationRunRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { runId, chatId } = params

		const run = await this.automationRunRepository!.findById(runId, runnerScope)
		if (!run) return { data: null }

		const saved = await this.automationRunRepository!.update(AutomationRun.fromJSON({ ...run, chatId }), runnerScope)

		return { data: saved }
	}
}
