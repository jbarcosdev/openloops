import { Logger } from 'openloops/common'
import { previewAutomationRuns } from 'openloops/automations'

async function previewRuns () {
    const logger = new Logger()

    const result = await previewAutomationRuns({
        recurrence: { type: 'monthly', day: 'last', time: '18:00' },
        timezone: 'America/New_York',
        count: 5,
    })

    logger.info(result.runs, '[Demo] Next runs')
}

previewRuns()
