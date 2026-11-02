import { Logger } from 'openloops/common'
import { login } from 'openloops/authentication'

async function loginExample () {
    const logger = new Logger()

    const result = await login({
        payload: {
            emailOrUsername: 'jose@openloops.xyz',
            password: 'openloops!',
        },
    })

    logger.info({ user: result.data.user, token: result.data.token }, '[Demo] Logged in')
}

loginExample()
