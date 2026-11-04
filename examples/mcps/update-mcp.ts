import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { updateMcpServer } from 'openloops/mcps'

/**
 * Updates a server of the user. Here the header carries a fixed token: the user wrote it, and it is sent as it is.
 *
 * Changing the headers checks the connection again and keeps the approval. Changing the `url` locks the server again.
 */
async function updateMcp () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateMcpServer({
        id: '6ab59c88d3ea4199c9b7ba09',
        payload: {
            name: 'test-mcp-updated',
            headers: {
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjcm0uZXhhbXBsZS5jb20iLCJzdWIiOiJzdmMtb3Blbmxvb3BzLWNybSIsImF1ZCI6ImNybS1tY3AiLCJzY29wZSI6ImNybTpyZWFkIGNybTp3cml0ZSIsImlhdCI6MTc2MjIxNDQwMCwiZXhwIjoxNzkzNzUwNDAwfQ.YCtd8mv7RZpaZb3Z1aSl25MGP2QRWHc8RtA82MJOH7U'
            }
        },
        currentUser,
    })

    logger.info(result, '[Demo] Updated mcp:')
}

updateMcp()
