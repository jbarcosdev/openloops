import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsage } from 'openloops/llmcalls'

async function getChatSessionUsage () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsage({
        filters: {
            sessionId: '6abc454162624f9e01929cd8' // chatId
        },
        currentUser,
    })

    logger.info({
        userId: currentUser?.userId,
        usage: result?.data,
    }, '[Demo] Chat session usage')
}

getChatSessionUsage()
