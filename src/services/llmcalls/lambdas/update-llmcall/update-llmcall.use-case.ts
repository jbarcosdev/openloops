import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { LLMCallRepository } from '../../repositories'
import { LLMCall, LLMCallProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: LLMCallProps
}

export interface Output extends BaseUseCaseOutput {
	data: LLMCallProps
}

@autoInjectable()
export class UpdateLLMCallUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(LLMCallRepository) private readonly llmCallRepository?: LLMCallRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating LLMCall')
		}

		const llmCall = LLMCall.fromJSON({ ...payload, _id: id })
		llmCall.setUpdatedBy(currentUser)

		this.logger.info(`Updating LLMCall: ${llmCall.stringify()}`)

		const result = await this.llmCallRepository?.update(llmCall)

		if (!result) {
			throw new Error('LLMCall not found or update failed')
		}

		return { data: result }
	}
}
