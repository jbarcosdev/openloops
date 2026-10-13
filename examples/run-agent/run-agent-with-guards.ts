import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { inputGuards } from 'openloops/guardrails'

async function runAgentWithGuards () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({
        loop: new AgiLoop(),
        guards: [
            inputGuards.blockCode,
            inputGuards.blockEmail.withReply('Please do not share email addresses here.'),
        ],
    })

    agent.addGuard(inputGuards.blockCard)

    const result = await agent.run({
        input: {
            message: 'my card is 4242 4242 4242 4242, can you remember it?',
        },
        currentUser,
    })

    logger.info(result.data?.lastAnswer, '[Demo] Blocked by a guard')
}

runAgentWithGuards()
