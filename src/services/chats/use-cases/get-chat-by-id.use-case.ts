import { QueryParams, Scope } from '@common/repositories'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { ChatRepository } from '../repositories'
import { ChatProps } from '../entities'
import { AgentStatus } from '@harness/agent-state'
import { deprecatedActivity } from '../utils/deprecated-activity'

export interface Params extends BaseUseCaseParams {
	id: string
	select?: QueryParams<ChatProps>['select']
}

export interface Output extends BaseUseCaseOutput {
	data: ChatProps | null
}

export class GetChatByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly chatRepository = new ChatRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, select, currentUser } = params
		const data = await this.chatRepository.findById(id, params.scope ?? Scope.canView(currentUser), select) || {}

		if (data.state?.status === AgentStatus.PROCESSING) data.state.currentActivity = deprecatedActivity(id)

		return { data }
	}
}
