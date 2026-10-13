import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsageStats } from 'openloops/llmcalls'

async function getRangeStats () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsageStats({
        filters: {
            fromDate: '2026-01-01',
            toDate: '2026-09-30',
            groupBy: 'month',
            provider: 'openai',
            model: 'gpt-4o-mini',
        },
        currentUser,
    })

    logger.info(result.data, '[Demo] Usage by month for one model')
}

getRangeStats()
