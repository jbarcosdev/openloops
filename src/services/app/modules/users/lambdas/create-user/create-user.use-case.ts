import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { UserRepository } from '../../repositories'
import { User, UserProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	payload?: UserProps
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps
}

@autoInjectable()
export class CreateUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(UserRepository) private readonly userRepository?: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, currentUser } = params
		if (!payload?.email) throw new Error('[Create User] email param is required')
		if (!payload?.password) throw new Error('[Create User] password param is required')

		const user = await User.create({ ...payload })
		user.setCreatedBy(currentUser)

		await this.userRepository?.create(user)

		const { password, ...rest } = user.toJSON()

		return { data: rest }
	}
}
