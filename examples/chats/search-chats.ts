import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getChatById, listChatsByUser } from 'openloops/chats'

/**
 * Searches the history of the user. `search` looks in the title and in the messages, and `select` returns only what a list needs,
 * so the messages do not travel. Once the user picks a chat, it is loaded complete.
 */
async function searchChats () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const history = await listChatsByUser({
        search: 'netflix',
        select: { title: 1, updatedAt: 1 },
        options: { page: 1, limit: 10 },
        currentUser,
    })

    logger.info(history.items.map(chat => ({ id: chat._id, title: chat.title ?? 'Untitled', updatedAt: chat.updatedAt })), '[Demo] History')

    const picked = history.items[0]?._id
    if (!picked) return

    const chat = await getChatById({ id: String(picked), currentUser })

    logger.info(chat?.messages, '[Demo] Messages')
}

searchChats()
