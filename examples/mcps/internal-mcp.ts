import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

async function runAgentWithInternalMcp (sessionToken: string) {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({
        loop: new AgiLoop(),
        internalMcps: [
            {
                name: 'sofi',
                url: 'https://api.sofi.cash/mcp',
                headers: { Authorization: 'Bearer {{token}}' },
            },
        ],
    })

    try {
        const result = await agent.run({
            input: {
                message: 'how much did I spend on food this month?',
            },
            currentUser,
            mcpTokens: { sofi: sessionToken },
        })

        logger.debug(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgentWithInternalMcp('the-token-of-the-session-of-the-user')
