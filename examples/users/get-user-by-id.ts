import { Logger } from 'openloops/common'
import { getUserById } from 'openloops/users'
import { CurrentUser } from 'openloops/base'

// Note: return the user without the password field
async function getUserByIdExample () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await getUserById({
        id: '6ab56894eb20887d1ef7942c',
        currentUser,
    })

    logger.info(result, '[Demo] User:')
}

getUserByIdExample()
