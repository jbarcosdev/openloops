import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listChatsByUser } from 'openloops/chats'

async function listAutonomousChats () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listChatsByUser({
        executionMode: 'autonomous',
        options: {
            page: 1,
            limit: 20,
        },
        currentUser,
    })

    const needsAttention = result.data?.filter(chat => chat.state?.status === 'awaiting_user_confirmation' || chat.state?.status === 'awaiting_user_input' || chat.state?.status === 'failed')

    logger.info(needsAttention?.map(chat => ({ id: chat._id, status: chat.state?.status })), '[Demo] Autonomous runs that need attention')
}

listAutonomousChats()
