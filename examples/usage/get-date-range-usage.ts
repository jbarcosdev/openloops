import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsage } from 'openloops/llmcalls'

async function getDateRangeUsage () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsage({
        filters: {
            fromDate: '2026-09-20',
            toDate: '2026-09-29',
        },
        currentUser,
    })

    logger.info({
        userId: currentUser?.userId,
        usage: result?.data,
    }, '[Demo] Date range usage')
}

getDateRangeUsage()
