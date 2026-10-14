import { Logger } from 'openloops/common'
import { createAgenticJobRunner } from 'openloops/agentic-jobs'
import { webSearchTool } from 'openloops/tools'
import { inputGuards } from 'openloops/guardrails'

async function notifyOwner (message: string) {
    const logger = new Logger()
    logger.info({ message }, '[Notification Service] Sending notification to the owner...')
}

const runner = createAgenticJobRunner({
    agent: {
        tools: [webSearchTool],
        guards: [inputGuards.blockCard],
        maxIterations: 30,
    },
    onRunFinished: async ({ job, run }) => {
        if (run.status === 'failed') await notifyOwner(`The job "${job.name}" failed: ${run.error?.message}`)
        if (run.status === 'paused') await notifyOwner(`The job "${job.name}" is waiting for you`)
        if (run.status === 'skipped') await notifyOwner(`The job "${job.name}" was skipped: ${run.skipReason}`)
    },
})

runner.start()

process.on('SIGTERM', async () => {
    await runner.stop()
    process.exit(0)
})
