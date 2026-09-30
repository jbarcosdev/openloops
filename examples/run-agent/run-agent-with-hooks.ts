import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { PlanExecuteLoop } from 'openloops/loops'

async function runAgentWithHooks () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const loop = new PlanExecuteLoop()
    const agent = new Agent({ loop })

    agent.addHook('pre_execution', () => {
        logger.info("[Pre Hook] I'm a pre execution hook")
    })

    agent.addHook('post_execution', () => {
        logger.info("[Post Hook] I'm a post execution hook")
    })

    agent.addHook('post_execution', async () => {
        if (agent.notifyOnCompletion) {
            await sendNotificationMock({
                targetId: '6ab56894eb20887d1ef7942c',
                title: 'Notification example',
                content: 'Hi, this is a notification',
            })
        }
    })

    try {
        const result = await agent.run({
            input: {
                message: 'what is the pauli exclusion principle?',
            },
            options: {
                notifyOnCompletion: true
            },
            currentUser,
        })

        logger.debug(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

async function sendNotificationMock (params: any) {
    const logger = new Logger()
    logger.info(params, '[Notification Service] Sending notification to user...')
}

runAgentWithHooks()
