import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsage } from 'openloops/llmcalls'

async function getMessageUsage () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsage({
        filters: {
            messageId: '6abc454162624f9e01929cd7' // id of assistant message/answer
        },
        currentUser,
    })

    logger.info({
        userId: currentUser?.userId,
        usage: result?.data,
    }, '[Demo] Usage for assistant answer')
}

getMessageUsage()
