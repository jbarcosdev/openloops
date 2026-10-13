import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsageStats } from 'openloops/llmcalls'

async function getCurrentMonthStats () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsageStats({ currentUser })

    logger.info({
        summary: result.data.summary,
        models: result.data.models,
        series: result.data.series,
    }, '[Demo] This month usage by day')
}

getCurrentMonthStats()
