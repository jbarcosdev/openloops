import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

/**
 * Strict mode: when an approved MCP server changed, the agent always asks the user, even if the change looks harmless.
 */
async function runAgentInStrictMode () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({
        loop: new AgiLoop(),
        strictMode: true,
    })

    const result = await agent.run({
        input: {
            message: 'list the repositories I have in my connected tools',
        },
        currentUser,
    })

    logger.info({
        status: result.data?.state?.status,
        answer: result.data?.lastAnswer,
    }, '[Demo] Result')
}

runAgentInStrictMode()
