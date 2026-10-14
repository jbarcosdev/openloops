import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { listAgenticJobsByUser } from 'openloops/agentic-jobs'

async function listJobs () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await listAgenticJobsByUser({
        options: {
            page: 1,
            limit: 20,
        },
        currentUser,
    })

    logger.info(result.data.map(job => ({
        name: job.name,
        enabled: job.enabled,
        nextRunAt: job.nextRunAt,
        lastRunStatus: job.lastRunStatus,
    })), '[Demo] Agentic jobs')
}

listJobs()
