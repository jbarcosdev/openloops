import { Logger } from 'openloops/common'
import { createAutomationRunner } from 'openloops/automations'
import { webSearchTool } from 'openloops/tools'

async function runNow () {
    const logger = new Logger()

    const runner = createAutomationRunner({
        agent: { tools: [webSearchTool] },
    })

    const { run } = await runner.runNow({ automationId: '6ad0c9a6d3ea4199c9b7ba10' })

    logger.info({ runId: run._id, status: run.status }, '[Demo] The run started in the background')

    await runner.stop()
}

runNow()
