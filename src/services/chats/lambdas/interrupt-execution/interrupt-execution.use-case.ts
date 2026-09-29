import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Chat, ChatProps } from '../../entities'
import { ChatRepository } from '../../repositories'

export interface Params extends BaseUseCaseParams {
	id?: string
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps
}

@autoInjectable()
export class InterruptExecutionUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(ChatRepository) private readonly chatRepository?: ChatRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params

		if (!id) {
			throw new Error('Id is required for updating Chat')
		}

		const chat = Chat.fromJSON({ _id: id })
		chat.setAgentState({} as any)
		chat.state?.interruptExecution()
		chat.setUpdatedBy(currentUser)

		this.logger.debug(chat, '[AGENT] Interrupting execution...')
		const result = await this.chatRepository?.update(chat)

		if (!result) {
			throw new Error('Chat not found or update failed')
		}

		return { data: result }
	}
}
