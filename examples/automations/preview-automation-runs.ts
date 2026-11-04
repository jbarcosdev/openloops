import { Logger } from 'openloops/common'
import { previewAutomationRuns } from 'openloops/automations'

/**
 * Shows the next dates a recurrence would run, without creating anything. Use it in a form so the user sees what they are scheduling (here, the last day of every month at 18:00).
 */
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
