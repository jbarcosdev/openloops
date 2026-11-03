import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserRepository } from '../repositories'
import { User, UserProps } from '../entities'
import { readDefaultModel } from '../utils/default-model'

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

		const model = payload.preferences ? await readDefaultModel(payload.preferences) : undefined

		const user = await User.create({ ...payload, ...(payload.preferences ? { preferences: model!.preferences } : {}) })

		await this.userRepository?.create(user, params.scope ?? Scope.canEdit(currentUser))

		const { password, ...rest } = user.toJSON()

		return { data: rest }
	}
}
