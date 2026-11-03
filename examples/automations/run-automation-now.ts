import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createAutomationRunner } from 'openloops/automations'
import { webSearchTool } from 'openloops/tools'

async function runNow () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const runner = createAutomationRunner({
        agent: { tools: [webSearchTool] },
    })

    const { run } = await runner.runNow({ automationId: '6ad0c9a6d3ea4199c9b7ba10', currentUser })

    logger.info({ runId: run._id, status: run.status }, '[Demo] The run started in the background')

    await runner.stop()
}

runNow()
