import { Agent, AgentStatus } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

async function runAgentAutonomous () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({ loop: new AgiLoop() })

    const result = await agent.run({
        input: {
            message: 'Summarize the news about the bitcoin price and keep the summary short',
        },
        options: {
            executionMode: 'autonomous',
        },
        currentUser,
    })

    const status = result.data?.state?.status

    if (status === AgentStatus.AWAITING_USER_CONFIRMATION || status === AgentStatus.AWAITING_USER_INPUT) {
        logger.warn({ chatId: result.data?._id, question: result.data?.lastAnswer }, '[Demo] The run is paused until the user answers')
        return
    }

    logger.info(result.data?.lastAnswer, '[Demo] Result')
}

runAgentAutonomous()
