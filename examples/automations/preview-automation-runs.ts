import { Logger } from 'openloops/common'
import { previewAutomationRuns } from 'openloops/automations'

async function previewRuns () {
    const logger = new Logger()

    const result = await previewAutomationRuns({
        recurrence: { type: 'monthly', day: 'last', time: '18:00' },
        timezone: 'America/Lima',
        count: 5,
    })

    logger.info(result.data.runs, '[Demo] Next runs')
}

previewRuns()
