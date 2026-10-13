import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listAllMcpServersByUser } from 'openloops/mcps'

async function listAllMcps () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listAllMcpServersByUser({ currentUser })

    logger.info(result.data.map(server => ({ name: server.name, trust: server.trust, status: server.status })), '[Demo] MCP Servers')
}

listAllMcps()
