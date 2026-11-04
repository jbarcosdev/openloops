import { BaseUseCase, BaseUseCaseParams } from '@common/base/base.use-case'
import { Scope } from '@common/repositories'
import { UserRepository } from '../repositories'
import { User, UserProps } from '../entities'
import { readDefaultModel } from '../utils/default-model'

export interface Params extends BaseUseCaseParams {
	id: string
	payload?: UserProps
}

export type Output = UserProps

export class UpdateUserUseCase extends BaseUseCase<Params, Output> {
	constructor (private readonly userRepository = new UserRepository()) {
		super()
	}

	async execute (params: Params): Promise<Output> {
		const { payload, id, currentUser } = params

		if (!payload || Object.keys(payload).length === 0) {
			throw new Error('Payload is required for updating user')
		}

		const model = payload.preferences ? await readDefaultModel(payload.preferences) : undefined

		const user = await User.create({ ...payload, ...(payload.preferences ? { preferences: model!.preferences } : {}), _id: id })

		if (model?.clear) user.clearedFields['preferences.defaultModel'] = ''

		this.logger.info({ userId: id }, '[Users] Updating user')

		const result = await this.userRepository.update(user, params.scope ?? Scope.canEdit(currentUser))

		if (!result) this.throwHttpError({ statusCode: 404, errorMessage: '{{resource_not_found}}' })

		return result
	}
}
