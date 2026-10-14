import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { validateRecurrence } from '../entities'
import { assertTimezone, previewNextRuns } from '../utils/next-run'

const DEFAULT_COUNT = 5

export interface Params extends BaseUseCaseParams {
	recurrence: unknown
	timezone: string
	count?: number
	from?: string | Date
}

export interface Output extends BaseUseCaseOutput {
	data: { runs: Date[] }
}

@autoInjectable()
export class PreviewAgenticJobRunsUseCase extends BaseUseCase<Params, Output> {
	async execute (params: Params): Promise<Output> {
		const recurrence = validateRecurrence(params.recurrence)
		const timezone = assertTimezone(params.timezone)
		const from = params.from ? new Date(params.from) : new Date()

		if (Number.isNaN(from.getTime())) throw new Error('The date to start from is not valid')

		return { data: { runs: previewNextRuns(recurrence, timezone, params.count ?? DEFAULT_COUNT, from) } }
	}
}
