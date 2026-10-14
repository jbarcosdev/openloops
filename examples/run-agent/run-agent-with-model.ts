import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

async function runAgentWithModel () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const loop = new AgiLoop()
    const agent = new Agent({ loop })

    try {
        const result = await agent.run({
            input: {
                message: 'hi, how are you?',
            },
            options: {
                modelProvider: 'anthropic',
                modelName: 'claude-haiku-5-5',
            },
            currentUser,
        })

        logger.info(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgentWithModel()
