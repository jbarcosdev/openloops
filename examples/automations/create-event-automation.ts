import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { createAutomation, issueAutomationEventToken } from 'openloops/automations'

async function createEventAutomation () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const created = await createAutomation({
        payload: {
            name: 'Cost anomaly analysis',
            instructions: 'Find the cause of the cost alert in AWS and send a short summary to the channel #costs',
            trigger: { type: 'event' },
        },
        currentUser,
    })

    const id = String(created.data._id)
    const issued = await issueAutomationEventToken({ id, expiresIn: '90d', currentUser })

    logger.info({ id, token: issued.data.token, expiresAt: issued.data.expiresAt }, '[Demo] Created automation, send events to it with this token')
}

createEventAutomation()
