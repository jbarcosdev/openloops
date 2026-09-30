import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { deleteMcpServer } from 'openloops/mcps'

async function softDeleteMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await deleteMcpServer({
        id: '6ab59c88d3ea4199c9b7ba09',
        currentUser,
    })

    logger.info(result, '[Demo] Deleted mcp result')
}

async function hardDeleteMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await deleteMcpServer({
        id: '6ab59c88d3ea4199c9b7ba09',
        currentUser,
    })

    logger.info(result, '[Demo] Deleted mcp result')
}

softDeleteMcp()

// hardDeleteMcp()
