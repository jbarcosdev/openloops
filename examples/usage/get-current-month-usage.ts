import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsage } from 'openloops/llmcalls'

async function getCurrentMonthUsage () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsage({
        filters: {},
        currentUser,
    })

    logger.info({
        userId: currentUser?.userId,
        usage: result?.data,
    }, '[Demo] This month usage')
}

getCurrentMonthUsage()
