import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listAllMcpServersByUser } from 'openloops/mcps'

/**
 * Lists every MCP server of the user, oldest first, without pages. It is what the agent uses. The internal servers never appear here.
 */
async function listAllMcps () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listAllMcpServersByUser({ currentUser })

    logger.info(result.items.map(server => ({ name: server.name, trust: server.trust, status: server.status })), '[Demo] MCP Servers')
}

listAllMcps()
