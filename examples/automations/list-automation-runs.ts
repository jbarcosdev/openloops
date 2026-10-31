import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listAutomationRunsByAutomation, listAutomationRunsByUser } from 'openloops/automations'

async function listRunsOfAJob () {
    const logger = new Logger()

    const result = await listAutomationRunsByAutomation({
        automationId: '6ad0c9a6d3ea4199c9b7ba10',
        options: { page: 1, limit: 20 },
    })

    logger.info(result.data.map(run => ({ status: run.status, startedAt: run.startedAt, chatId: run.chatId, error: run.error })), '[Demo] Runs of the automation')
}

async function listRunsThatNeedAttention () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const paused = await listAutomationRunsByUser({ status: 'paused', currentUser })
    const failed = await listAutomationRunsByUser({ status: 'failed', currentUser })

    logger.info({ paused: paused.data.length, failed: failed.data.length }, '[Demo] Runs that need attention')
}

listRunsOfAJob()

// listRunsThatNeedAttention()
