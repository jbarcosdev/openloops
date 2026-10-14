import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { updateAgenticJob } from 'openloops/agentic-jobs'

async function pauseJob () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateAgenticJob({
        id: '6ad0c9a6d3ea4199c9b7ba10',
        payload: { enabled: false },
        currentUser,
    })

    logger.info({ enabled: result.data.enabled }, '[Demo] The job is off')
}

async function resumeJob () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateAgenticJob({
        id: '6ad0c9a6d3ea4199c9b7ba10',
        payload: {
            enabled: true,
            recurrence: { type: 'daily', time: '07:30' },
        },
        currentUser,
    })

    logger.info({ nextRunAt: result.data.nextRunAt }, '[Demo] The job is on again')
}

pauseJob()

// resumeJob()
