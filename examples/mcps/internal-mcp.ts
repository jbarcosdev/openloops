import { Agent } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

async function runAgentWithInternalMcp (sessionToken: string) {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({
        loop: new AgiLoop(),
        internalMcps: [
            {
                name: 'budget',
                url: 'https://budget.example.com/mcp',
                headers: { Authorization: 'Bearer {{token}}' },
            },
            {
                name: 'crm',
                url: 'https://crm.example.com/mcp',
                headers: { Authorization: 'Bearer {{token}}' },
                autonomousToken: process.env.CRM_SERVICE_TOKEN,
            },
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
