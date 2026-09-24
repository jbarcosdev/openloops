import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { UserRepository } from '../../repositories'
import { QueryOptions } from '@common/repositories'
import { UserProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	where: UserProps
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps[] | null | undefined
}

@autoInjectable()
export class ListUsersByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(UserRepository) private readonly userRepository?: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options } = params
		const result = await this.userRepository?.findByProps(where, options || {})

		return { data: result }
	}
}
