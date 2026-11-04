import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

/**
 * Declares internal MCP servers in code. They belong to your solution, not to the user, and they are trusted: no approval, no manifest review, no notice of third party. A destructive tool still asks the user.
 *
 * `mcpTokens` gives the token of the user to the servers that use `{{token}}`, by name. It is never saved.
 */
async function runAgentWithInternalMcp (sessionToken: string) {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({
        loop: new AgiLoop(),
        internalMcps: [
            /**
             * An MCP with a template: it uses the token of the user from `mcpTokens`. In an automation there is no token, so it is unavailable there.
             */
            {
                name: 'budget',
                url: 'https://budget.example.com/mcp',
                headers: { Authorization: 'Bearer {{token}}' },
            },
            /**
             * An MCP with a template and a token for automations: in a chat it uses the token of the user. In an autonomous run, such as an automation, that brings no token for it, it uses `autonomousToken`, the token of a service account, and the agent sends the id of the owner in `X-User-Id`. A chat never uses `autonomousToken`.
             */
            {
                name: 'crm',
                url: 'https://crm.example.com/mcp',
                headers: { Authorization: 'Bearer {{token}}' },
                autonomousToken: process.env.CRM_SERVICE_TOKEN,
            },
            /**
             * An MCP with a fixed token: always the service account, in chats and in automations, for every user. Use it only for data that does not depend on the user.
             */
            {
                name: 'catalog',
                url: 'https://catalog.example.com/mcp',
                headers: { Authorization: `Bearer ${process.env.CATALOG_SERVICE_TOKEN}` },
            },
        ],
    })

    try {
        const result = await agent.run({
            input: {
                message: 'how much did I spend on food this month?',
            },
            currentUser,
            mcpTokens: { budget: sessionToken, crm: sessionToken },
        })

        logger.debug(result, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runAgentWithInternalMcp('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjcm0uZXhhbXBsZS5jb20iLCJzdWIiOiJzdmMtb3Blbmxvb3BzLWNybSIsImF1ZCI6ImNybS1tY3AiLCJzY29wZSI6ImNybTpyZWFkIGNybTp3cml0ZSIsImlhdCI6MTc2MjIxNDQwMCwiZXhwIjoxNzkzNzUwNDAwfQ.YCtd8mv7RZpaZb3Z1aSl25MGP2QRWHc8RtA82MJOH7U')
