import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { updateAutomation } from 'openloops/automations'

/**
 * Turns off the schedule of an automation without deleting it. Triggers are merged key by key, so only `enabled` changes.
 */
async function pause () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateAutomation({
        id: '6ad0c9a6d3ea4199c9b7ba10',
        payload: { triggers: { schedule: { enabled: false } } },
        currentUser,
    })

    logger.info({ enabled: result.triggers?.schedule?.enabled }, '[Demo] The automation is off')
}

/**
 * Turns the schedule on again and changes its recurrence at the same time. The next run is calculated again.
 */
async function resume () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateAutomation({
        id: '6ad0c9a6d3ea4199c9b7ba10',
        payload: {
            triggers: { schedule: { enabled: true, recurrence: { type: 'daily', time: '07:30' } } },
        },
        currentUser,
    })

    logger.info({ nextRunAt: result.triggers?.schedule?.nextRunAt }, '[Demo] The automation is on again')
}

pause()

// resume()
