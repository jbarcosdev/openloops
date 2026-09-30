import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createMcpServer } from 'openloops/mcps'

async function createMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await createMcpServer({
        payload: {
            name: 'test-mcp',
            type: 'http',
            url: 'https://agentaddress.dev/api/mcp',
            headers: {
                'Accept': 'text/event-stream'
            }
        },
        currentUser,
    })

    logger.info(result, '[Demo] Created mcp:')
}

createMcp()
