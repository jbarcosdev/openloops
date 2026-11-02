import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listAutomationsByUser } from 'openloops/automations'

async function listAutomations () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listAutomationsByUser({
        options: {
            page: 1,
            limit: 20,
        },
        currentUser,
    })

    logger.info(result.data.map(automation => ({
        name: automation.name,
        scheduleEnabled: automation.triggers?.schedule?.enabled,
        eventEnabled: automation.triggers?.event?.enabled,
        nextRunAt: automation.triggers?.schedule?.nextRunAt,
        lastRunStatus: automation.lastRunStatus,
    })), '[Demo] Automations')
}

listAutomations()
