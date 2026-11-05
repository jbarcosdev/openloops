import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { fetchUrlTool } from 'openloops/tools'

/**
 * Adds the tool that reads web pages as text. It needs no key, but it does not run JavaScript, so pages that load their content in the browser come back empty.
 */
async function runAgentWithFetchUrl () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const loop = new AgiLoop()
    const agent = new Agent({ loop })
    agent.addTool(fetchUrlTool)

    try {
        const result = await agent.run({
            input: {
                message: 'read https://example.com and tell me what the page says',
            },
            currentUser,
        })

        logger.debug(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgentWithFetchUrl()
