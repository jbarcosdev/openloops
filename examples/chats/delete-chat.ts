import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { deleteChat } from 'openloops/chats'

async function softDeleteChat () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await deleteChat({
        id: '6abc454162624f9e01929cd8',
        currentUser,
    })

    logger.info(result, '[Demo] Deleted chat')
}

async function hardDeleteChat () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await deleteChat({
        id: '6abc454162624f9e01929cd8',
        hardDelete: true,
        currentUser,
    })

    logger.info(result, '[Demo] Deleted chat')
}

softDeleteChat()

// hardDeleteChat()
