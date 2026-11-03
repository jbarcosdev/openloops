import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { QueryOptions, Scope } from '@common/repositories'
import { UserRepository } from '../repositories'
import { UserProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	where: UserProps
	options?: QueryOptions
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps[] | null | undefined
	hasMore?: boolean
}

@autoInjectable()
export class ListUsersByPropsUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(UserRepository) private readonly userRepository?: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { where, options, currentUser } = params
		const result = await this.userRepository?.findByProps(where, options || {}, params.scope ?? Scope.asAdmin(currentUser))

		return { data: result?.items, hasMore: result?.hasMore }
	}
}
