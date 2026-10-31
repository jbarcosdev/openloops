import { Logger } from 'openloops/common'
import { AutomationEventError, receiveAutomationEvent } from 'openloops/automations'

async function receive (automationId: string, authorization: string, body: unknown, idempotencyKey?: string) {
    const logger = new Logger()

    try {
        const { data } = await receiveAutomationEvent({
            automationId,
            token: authorization.replace(/^Bearer /, ''),
            payload: body,
            idempotencyKey,
        })

        logger.info({ status: data.status, runId: data.run._id }, '[Demo] Event received, answer 202')
    } catch (error) {
        if (error instanceof AutomationEventError) {
            logger.warn({ reason: error.reason, statusCode: error.statusCode }, '[Demo] Event rejected')
            return
        }

        throw error
    }
}

receive('6ad0c9a6d3ea4199c9b7ba10', 'Bearer eyJ...', { alarm: 'CostAnomaly', amount: 1200 }, 'alarm-2026-10-30-1')
