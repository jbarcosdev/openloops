import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserRepository } from '../repositories'
import { UserProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
}

export type Output = UserProps | null

export class GetUserByIdUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly userRepository = new UserRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, currentUser } = params
		const result = await this.userRepository.findById(id, params.scope ?? Scope.canView(currentUser))
		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
