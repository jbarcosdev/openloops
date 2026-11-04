import { Logger } from 'openloops/common'
import { login } from 'openloops/authentication'

/**
 * Logs in with an email or a username and a password.
 *
 * The result has a short access token, a refresh token and the user. Send the access token to your backend on every request and use the refresh token to get a new one when it expires.
 */
async function loginExample () {
    const logger = new Logger()

    const result = await login({
        payload: {
            emailOrUsername: 'jose@openloops.xyz',
            password: 'openloops!',
        },
    })

    logger.info({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken }, '[Demo] Logged in')
}

loginExample()
