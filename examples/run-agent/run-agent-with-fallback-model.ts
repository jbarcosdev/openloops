import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

async function runAgentWithFallbackModel () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({
        loop: new AgiLoop(),
        fallbackModel: { provider: 'anthropic', model: 'claude-haiku-5-5' },
    })

    const result = await agent.run({
        input: { message: 'hi, how are you?' },
        currentUser,
    })

    logger.info(result.data?.settings, '[Demo] The chat saved the model that it used')
}

runAgentWithFallbackModel()
