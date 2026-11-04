import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createAutomation, issueAutomationEventToken } from 'openloops/automations'

/**
 * Creates an automation that starts when another system sends it an event, and issues the token that system must use.
 *
 * The token is not stored: the owner can issue as many as they want. It expires in 90 days here, and without `expiresIn` it never expires.
 */
async function createEventAutomation () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const created = await createAutomation({
        payload: {
            name: 'Cost anomaly analysis',
            instructions: 'Find the cause of the cost alert in AWS and send a short summary to the channel #costs',
            triggers: { event: {} },
        },
        currentUser,
    })

    const id = String(created._id)
    const issued = await issueAutomationEventToken({ id, expiresIn: '90d', currentUser })

    logger.info({ id, token: issued.token, expiresAt: issued.expiresAt }, '[Demo] Created automation, send events to it with this token')
}

createEventAutomation()
