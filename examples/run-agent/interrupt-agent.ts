import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'

async function interruptAgent () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    await Agent.interruptExecution('6abc454162624f9e01929cd8', currentUser)

    logger.info('[Demo] Stop requested, the running loop will stop before its next node')
}

interruptAgent()
