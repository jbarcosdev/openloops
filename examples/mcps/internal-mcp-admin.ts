import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createInternalMcp, updateInternalMcp, listInternalMcps, deleteInternalMcp } from 'openloops/mcps/admin'

async function manageInternalMcps () {
    const logger = new Logger()
    const admin = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!admin) throw new Error('[Demo] admin is not defined')

    const crm = await createInternalMcp({
        payload: {
            name: 'crm',
            url: 'https://crm.example.com/mcp',
            environment: 'production',
            headers: { Authorization: 'Bearer {{token}}' },
        },
        currentUser: admin,
    })

    logger.info(crm, '[Demo] Created internal mcp:')

    const catalog = await createInternalMcp({
        payload: {
            name: 'catalog',
            url: 'https://catalog.example.com/mcp',
            environment: 'production',
            headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjcm0uZXhhbXBsZS5jb20iLCJzdWIiOiJzdmMtb3Blbmxvb3BzLWNybSIsImF1ZCI6ImNybS1tY3AiLCJzY29wZSI6ImNybTpyZWFkIGNybTp3cml0ZSIsImlhdCI6MTc2MjIxNDQwMCwiZXhwIjoxNzkzNzUwNDAwfQ.YCtd8mv7RZpaZb3Z1aSl25MGP2QRWHc8RtA82MJOH7U' },
        },
        currentUser: admin,
    })

    await updateInternalMcp({ id: String(catalog._id), payload: { enabled: false }, currentUser: admin })

    const page = await listInternalMcps({ options: { page: 1, limit: 10 }, currentUser: admin })

    logger.info({ names: page.items.map(item => item.name) }, '[Demo] Internal mcps:')

    await deleteInternalMcp({ id: String(catalog._id), currentUser: admin })
}

manageInternalMcps()
