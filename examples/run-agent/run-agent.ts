import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { PlanExecuteLoop } from 'openloops/loops'

async function runAgent () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const loop = new PlanExecuteLoop()
    const agent = new Agent({ loop })

    try {
        const result = await agent.run({
            input: {
                message: 'hi, how are you?',
            },
            currentUser,
        })

        logger.info(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgent()
