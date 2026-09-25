import { autoInjectable, inject } from 'tsyringe'
import { QueryOptions } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { ChatRepository } from '../../repositories'
import { ChatProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	where: Partial<ChatProps>
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps[] | null | undefined
}

@autoInjectable()
export class ListChatsByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(ChatRepository) private readonly chatRepository?: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options } = params
		const result = await this.chatRepository?.findByProps(where, options || {})

		return { data: result }
	}
}
