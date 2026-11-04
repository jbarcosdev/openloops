import { Logger } from 'openloops/common'
import { AutomationEventError, receiveAutomationEvent } from 'openloops/automations'

/**
 * Receives an event from another system, for example in the endpoint of your backend that gets the call of an alarm.
 *
 * The token travels in the header `Authorization: Bearer ...`. The `idempotencyKey` is optional: with it, a repeated event does not start a second run. A refused event throws an `AutomationEventError` that carries the HTTP status to answer.
 */
async function receive (automationId: string, authorization: string, body: unknown, idempotencyKey?: string) {
    const logger = new Logger()

    try {
        const data = await receiveAutomationEvent({
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
