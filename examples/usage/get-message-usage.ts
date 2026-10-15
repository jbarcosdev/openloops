import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsageByMessage } from 'openloops/llmcalls'

async function getMessageUsage () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsageByMessage({
        messageId: '6abc454162624f9e01929cd7',
        currentUser,
    })

    logger.info({
        summary: result.data.summary,
        models: result.data.models,
    }, '[Demo] Usage for assistant answer')
}

getMessageUsage()
