import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getMcpServerById, decideMcpServerTrust } from 'openloops/mcps'

async function approveMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')
    const id = '6ab59c88d3ea4199c9b7ba09'

    const { data: server } = await getMcpServerById({ id, currentUser })
    const latest = server?.history?.[0]

    if (!latest) throw new Error('[Demo] the server has no manifest yet, verify its connection first')

    const result = await decideMcpServerTrust({
        id,
        decision: 'approve',
        manifestHash: latest.hash,
        currentUser,
    })

    logger.info({ trust: result.data.trust, approvedHash: result.data.approvedHash }, '[Demo] Approved mcp')
}

async function blockMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await decideMcpServerTrust({
        id: '6ab59c88d3ea4199c9b7ba09',
        decision: 'block',
        currentUser,
    })

    logger.info({ trust: result.data.trust }, '[Demo] Blocked mcp')
}

approveMcp()

// blockMcp()
