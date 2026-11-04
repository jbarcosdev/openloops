import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { verifyMcpServerConnection } from 'openloops/mcps'

/**
 * Checks the connection of a server: it reads the manifest and saves the status (`ok` or `error`). Use it in a "test connection" button, it also feeds a green or red dot.
 */
async function verifyMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await verifyMcpServerConnection({
        id: '6ab59c88d3ea4199c9b7ba09',
        currentUser,
    })

    logger.info({ status: result.status, lastError: result.lastError }, '[Demo] Connection check')
}

verifyMcp()
