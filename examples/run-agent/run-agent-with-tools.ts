import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { webSearchTool } from 'openloops/tools'

async function runAgentWithTools () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const loop = new AgiLoop()
    const agent = new Agent({ loop })
    agent.addTool(webSearchTool) // requires a serper api key (add SERPER_API_KEY to your .env file)

    try {
        const result = await agent.run({
            input: {
                message: 'what is the price of the bitcoin?',
            },
            currentUser,
        })

        logger.debug(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgentWithTools()
