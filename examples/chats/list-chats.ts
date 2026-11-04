import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listChatsByUser } from 'openloops/chats'

/**
 * Lists the chats of the user in pages.
 */
async function listChats () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listChatsByUser({
        options: {
            page: 1,
            limit: 10,
        },
        currentUser,
    })

    logger.info(result.items.map(chat => ({ id: chat._id, status: chat.state?.status })), '[Demo] Chats')
}

listChats()
