import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createAgenticJob } from 'openloops/agentic-jobs'

async function createJob () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await createAgenticJob({
        payload: {
            name: 'Morning report',
            instructions: 'Summarize the news about the bitcoin price and keep the summary short',
            recurrence: { type: 'weekly', days: [1, 2, 3, 4, 5], time: '08:00' },
            timezone: 'America/Lima',
            modelProvider: 'anthropic',
            modelName: 'claude-haiku-5-5',
        },
        currentUser,
    })

    logger.info({ id: result.data._id, nextRunAt: result.data.nextRunAt }, '[Demo] Created agentic job')
}

createJob()
