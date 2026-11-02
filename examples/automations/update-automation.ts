import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { updateAutomation } from 'openloops/automations'

async function pause () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateAutomation({
        id: '6ad0c9a6d3ea4199c9b7ba10',
        payload: { triggers: { schedule: { enabled: false } } },
        currentUser,
    })

    logger.info({ enabled: result.data.triggers?.schedule?.enabled }, '[Demo] The automation is off')
}

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

    logger.info({ nextRunAt: result.data.triggers?.schedule?.nextRunAt }, '[Demo] The automation is on again')
}

pause()

// resume()
