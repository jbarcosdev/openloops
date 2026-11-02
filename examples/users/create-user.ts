import { createUser, UserRole } from 'openloops/users'
import { Logger } from 'openloops/common'

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
        sanitize: false
    })

    logger.info(result, '[Demo] Created user:')
}

createUserExample()
