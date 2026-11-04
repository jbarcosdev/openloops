import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createMcpServer } from 'openloops/mcps'

/**
 * Registers an MCP server of the user. It starts `locked`: the first time the agent needs it, the user must approve it.
 *
 * `environment` is only a label (for example `staging`), the agent does not use it. Creating the server connects once to read its manifest.
 */
async function createMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await createMcpServer({
        payload: {
            name: 'gemini_demo_mcp',
            type: 'http',
            url: 'https://gemini-api-demos.uc.r.appspot.com/mcp',
            environment: 'staging',
            headers: {
                'Accept': 'text/event-stream'
            }
        },
        currentUser,
    })

    logger.info(result, '[Demo] Created mcp:')
}

createMcp()
