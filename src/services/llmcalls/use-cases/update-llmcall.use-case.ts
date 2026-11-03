import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { LLMCallRepository } from '../repositories'
import { LLMCall, LLMCallProps } from '../entities'

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

		this.logger.info(`Updating LLMCall: ${llmCall.stringify()}`)

		const result = await this.llmCallRepository?.update(llmCall, params.scope ?? Scope.canEdit(currentUser))

		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
