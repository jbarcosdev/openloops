import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listChatsByUser } from 'openloops/chats'

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

    logger.info(result.data?.map(chat => ({ id: chat._id, status: chat.state?.status })), '[Demo] Chats')
}

listChats()
