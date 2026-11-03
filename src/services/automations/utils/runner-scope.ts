import { Scope } from '@common/repositories'

export const runnerScope = Scope.system('automations runner: the locks and the runs of the automations of all the users')

export const eventScope = Scope.system('automation event: the token authorizes the request, there is no user')
