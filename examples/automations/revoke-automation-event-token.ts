import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { revokeAutomationEventToken, rotateAutomationEventTokens } from 'openloops/automations'

async function revokeLeakedToken () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await revokeAutomationEventToken({ id: '6ad0c9a6d3ea4199c9b7ba10', token: 'eyJ...', currentUser })

    logger.info({ jti: result.data.jti }, '[Demo] That token no longer works, the others still do')
}

async function rotateAll () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await rotateAutomationEventTokens({ id: '6ad0c9a6d3ea4199c9b7ba10', currentUser })

    logger.info({ trigger: result.data.trigger }, '[Demo] Every token issued before stopped working, issue a new one')
}

revokeLeakedToken()

// rotateAll()
