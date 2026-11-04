import { Logger } from 'openloops/common'
import { createAutomationRunner } from 'openloops/automations'
import { webSearchTool } from 'openloops/tools'
import { inputGuards } from 'openloops/guardrails'

async function notifyOwner (message: string) {
    const logger = new Logger()
    logger.info({ message }, '[Notification Service] Sending notification to the owner...')
}

/**
 * Worker that runs the automations. Start it in its own process: it looks for due schedules and queued events and runs each one in autonomous mode.
 *
 * The internal MCP `crm` uses the token of the user when there is one. An automation has no session of the user, so there it uses `autonomousToken`, the token of a service account, and the agent also sends the id of the owner in `X-User-Id`.
 *
 * `onRunFinished` is where you notify the owner when a run fails, is paused or is skipped.
 */
const runner = createAutomationRunner({
    agent: {
        tools: [webSearchTool],
        internalMcps: [
            {
                name: 'crm',
                url: 'https://crm.example.com/mcp',
                headers: { Authorization: 'Bearer {{token}}' },
                autonomousToken: process.env.CRM_SERVICE_TOKEN,
            },
        ],
        guards: [inputGuards.blockCard],
        maxIterations: 30,
    },
    onRunFinished: async ({ automation, run }) => {
        if (run.status === 'failed') await notifyOwner(`The automation "${automation.name}" failed: ${run.error?.message}`)
        if (run.status === 'paused') await notifyOwner(`The automation "${automation.name}" is waiting for you`)
        if (run.status === 'skipped') await notifyOwner(`The automation "${automation.name}" was skipped: ${run.skipReason}`)
    },
})

runner.start()

process.on('SIGTERM', async () => {
    await runner.stop()
    process.exit(0)
})
