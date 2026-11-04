import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listAutomationRunsByAutomation, listAutomationRunsByUser } from 'openloops/automations'

/**
 * Lists the history of runs of one automation, with its status and the chat where each run happened.
 */
async function listRunsOfAnAutomation () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listAutomationRunsByAutomation({
        automationId: '6ad0c9a6d3ea4199c9b7ba10',
        options: { page: 1, limit: 20 },
        currentUser,
    })

    logger.info(result.items.map(run => ({ status: run.status, startedAt: run.startedAt, chatId: run.chatId, error: run.error })), '[Demo] Runs of the automation')
}

/**
 * Counts the runs of the user that are paused (waiting for an answer in the chat) or failed, to show them in a screen of pending items.
 */
async function listRunsThatNeedAttention () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const paused = await listAutomationRunsByUser({ status: 'paused', currentUser })
    const failed = await listAutomationRunsByUser({ status: 'failed', currentUser })

    logger.info({ paused: paused.items.length, failed: failed.items.length }, '[Demo] Runs that need attention')
}

listRunsOfAnAutomation()

// listRunsThatNeedAttention()
