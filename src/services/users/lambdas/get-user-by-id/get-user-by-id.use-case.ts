import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { UserRepository } from '../../repositories'
import { UserProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps | null | undefined
}

@autoInjectable()
export class GetUserByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(UserRepository) private readonly userRepository?: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id } = params
		const result = await this.userRepository?.findById(id)

		return { data: result }
	}
}
