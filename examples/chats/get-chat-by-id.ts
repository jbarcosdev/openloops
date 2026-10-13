import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getChatById } from 'openloops/chats'

async function getChat () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getChatById({
        id: '6abc454162624f9e01929cd8',
        currentUser,
    })

    logger.info(result.data?.messages, '[Demo] Messages')
}

async function getChatStatus () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getChatById({
        id: '6abc454162624f9e01929cd8',
        select: { state: 1 },
        currentUser,
    })

    logger.info(result.data?.state, '[Demo] Chat state')
}

getChat()

// getChatStatus()
