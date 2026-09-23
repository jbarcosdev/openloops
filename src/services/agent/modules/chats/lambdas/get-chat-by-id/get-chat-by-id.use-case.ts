import { autoInjectable } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { ChatRepository } from '../../repositories'
import { ChatProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps | null
}

@autoInjectable()
export class GetChatByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id } = params
		const data = await this.chatRepository.findById(id) || {}

		return { data }
	}
}
