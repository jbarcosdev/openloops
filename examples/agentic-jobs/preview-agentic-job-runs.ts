import { Logger } from 'openloops/common'
import { previewAgenticJobRuns } from 'openloops/agentic-jobs'

async function previewRuns () {
    const logger = new Logger()

    const result = await previewAgenticJobRuns({
        recurrence: { type: 'monthly', day: 'last', time: '18:00' },
        timezone: 'America/Lima',
        count: 5,
    })

    logger.info(result.data.runs, '[Demo] Next runs')
}

previewRuns()
