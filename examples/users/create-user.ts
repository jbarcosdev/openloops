import { createUser, UserRole } from 'openloops/users'
import { Scope } from 'openloops/base'
import { Logger } from 'openloops/common'

/**
 * Creates a user. There is no session yet, so the call uses a system scope with a reason.
 */
async function createUserExample () {
    const logger = new Logger()

    const result = await createUser({
        payload: {
            firstName: 'Jose',
            lastName: 'Barcos',
            email: 'jose@openloops.xyz',
            password: 'openloops!',
            role: UserRole.USER
        },
        scope: Scope.system('demo')
    })

    logger.info(result, '[Demo] Created user:')
}

createUserExample()
