import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { UserRepository } from '../../repositories'
import { User, UserProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: UserProps
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps
}

@autoInjectable()
export class UpdateUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(UserRepository) private readonly userRepository?: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating user')
		}

		const user = await User.create({ ...payload, _id: id })
		user.setUpdatedBy(currentUser)

		this.logger.info(`Updating user: ${user.stringify()}`)

		const result = await this.userRepository?.update(user)

		if (!result) {
			throw new Error('User not found or update failed')
		}

		return { data: result }
	}
}
