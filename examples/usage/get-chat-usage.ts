import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { getLLMUsageByChat } from 'openloops/llmcalls'

async function getChatUsage () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getLLMUsageByChat({
        chatId: '6abc454162624f9e01929cd8',
        currentUser,
    })

    logger.info({
        summary: result.data.summary,
        models: result.data.models,
    }, '[Demo] Chat usage')
}

getChatUsage()
