import { autoInjectable, inject } from 'tsyringe'
import { BaseUseCase, BaseUseCaseParams, BaseUseCaseOutput } from '@common/core/base.use-case'
import { UserRepository } from '../../repositories'
import { User, UserProps } from '../../entities'

export interface Params extends BaseUseCaseParams {
	id: string
	hardDelete?: boolean
	accountDeletionReason?: string
}

export interface Output extends BaseUseCaseOutput {
	data: UserProps
}

@autoInjectable()
export class DeleteUserUseCase extends BaseUseCase<Params, Output> {
	constructor (@inject(UserRepository) private readonly userRepository?: UserRepository) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { id, hardDelete, accountDeletionReason, currentUser } = params
		if (!id) throw new Error('Missing id')

		if (hardDelete) {
			if (!currentUser?.isAdmin()) this.throwError403()

			const result = await this.userRepository?.deleteById(id)
			return { data: { deletedCount: result } as any }
		}

		// soft delete
		const user = await User.fromJSON({ _id: id, deletedReason: accountDeletionReason })
		user.setDeletedBy(currentUser)
		const result = await this.userRepository?.update(user)

		return { data: result || {} }
	}
}
