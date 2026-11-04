import { CurrentUser, CurrentSession } from '@common/base'
import { Scope } from '@common/repositories'
import { BaseApp } from './base.app'

export interface BaseUseCaseParams {
	currentUser?: CurrentUser
	currentSession?: CurrentSession
	scope?: Scope
}

export abstract class BaseUseCase<TReq, TRes> extends BaseApp {
	abstract execute (params?: TReq): Promise<TRes>
}
