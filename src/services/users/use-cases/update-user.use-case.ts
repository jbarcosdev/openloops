import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { UserRepository } from '../repositories'
import { User, UserProps } from '../entities'
import { readDefaultModel } from '../utils/default-model'

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

		const model = payload.preferences ? await readDefaultModel(payload.preferences) : undefined

		const user = await User.create({ ...payload, ...(payload.preferences ? { preferences: model!.preferences } : {}), _id: id })
		user.setUpdatedBy(currentUser)

		if (model?.clear) user.unset(['preferences.defaultModel' as keyof User])

		this.logger.info(`Updating user: ${user.stringify()}`)

		const result = await this.userRepository?.update(user)

		if (!result) {
			throw new Error('User not found or update failed')
		}

		return { data: result }
	}
}
