import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { webSearchTool, sendSlackMessageTool } from 'openloops/tools'

async function runAgentWithSlack () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const loop = new AgiLoop()
    const agent = new Agent({ loop })
    agent.addTool(webSearchTool) // requires a serper api key (add SERPER_API_KEY to your .env file)
    agent.addTool(sendSlackMessageTool) // requires a slack bot token (add SLACK_BOT_TOKEN to your .env file) and the bot invited to the channel

    try {
        const result = await agent.run({
            input: {
                message: 'search the price of the bitcoin and send it to the #general channel on slack',
            },
            currentUser,
        })

        logger.debug(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgentWithSlack()
