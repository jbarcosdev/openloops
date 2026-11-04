import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createInternalMcp, updateInternalMcp, listInternalMcps, deleteInternalMcp } from 'openloops/mcps/admin'

/**
 * Back office of the internal MCP servers. It needs an admin, anyone else gets 403.
 *
 * These servers are stored in the database, trusted (no manifest review) and loaded by the agent in every run. The users never see them.
 */
async function manageInternalMcps () {
    const logger = new Logger()
    const admin = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!admin) throw new Error('[Demo] admin is not defined')

    /**
     * An MCP with a template. `{{token}}` is replaced in each run with the token of the user, passed in `mcpTokens`, so the server acts on behalf of that user.
     *
     * If a run brings no token for it, the server is unavailable for that run and the agent continues without it. In an automation there is no token of the user, so it is unavailable there too.
     */
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

    /**
     * An MCP with a fixed token. The header has the token written in it, so it is sent as it is in every run, for every user and also in automations.
     *
     * Use it only for a service account that does not depend on the user. The token is stored as written, so do not return it to a client.
     */
    const catalog = await createInternalMcp({
        payload: {
            name: 'catalog',
            url: 'https://catalog.example.com/mcp',
            environment: 'production',
            headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjcm0uZXhhbXBsZS5jb20iLCJzdWIiOiJzdmMtb3Blbmxvb3BzLWNybSIsImF1ZCI6ImNybS1tY3AiLCJzY29wZSI6ImNybTpyZWFkIGNybTp3cml0ZSIsImlhdCI6MTc2MjIxNDQwMCwiZXhwIjoxNzkzNzUwNDAwfQ.YCtd8mv7RZpaZb3Z1aSl25MGP2QRWHc8RtA82MJOH7U' },
        },
        currentUser: admin,
    })

    /**
     * Disables the server without deleting it. A disabled server is not loaded by the agent.
     */
    await updateInternalMcp({ id: String(catalog._id), payload: { enabled: false }, currentUser: admin })

    /**
     * Lists the internal servers in pages.
     */
    const page = await listInternalMcps({ options: { page: 1, limit: 10 }, currentUser: admin })

    logger.info({ names: page.items.map(item => item.name) }, '[Demo] Internal mcps:')

    /**
     * Deletes the server for good.
     */
    await deleteInternalMcp({ id: String(catalog._id), currentUser: admin })
}

manageInternalMcps()
