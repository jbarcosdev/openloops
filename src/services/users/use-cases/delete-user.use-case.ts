import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserRepository } from '../repositories'
import { UserProps } from '../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
	accountDeletionReason?: string
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps
}

export class DeleteUserUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly userRepository = new UserRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, accountDeletionReason, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			const result = await this.userRepository.deleteById(id, params.scope ?? Scope.asAdmin(currentUser))
			return { data: { deletedCount: result } as any }
		}

		const result = await this.userRepository.softDeleteById(id, params.scope ?? Scope.canManage(currentUser), accountDeletionReason)
		if (!result) return this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' }) as any

		return { data: result }
	}
}
