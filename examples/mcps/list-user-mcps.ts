import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listMcpServersByUser } from 'openloops/mcps'

async function getMcpById () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listMcpServersByUser({
        options: {
            page: 1,          // optional
            limit: 10,        // optional
            sortBy: {
                createdAt: -1 // optional
            }
        },
        currentUser, // required
    })

    logger.info(result, '[Demo] MCP Server')
}

getMcpById()
