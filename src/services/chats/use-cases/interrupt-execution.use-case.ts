import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { Chat, ChatProps } from '../entities'
import { ChatRepository } from '../repositories'

export interface Params extends BaseUseCaseParams {
	id?: string
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps
}

export class InterruptExecutionUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
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

		this.logger.debug(chat, '[AGENT] Interrupting execution...')
		const result = await this.chatRepository.update(chat, params.scope ?? Scope.canEdit(currentUser))

		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
