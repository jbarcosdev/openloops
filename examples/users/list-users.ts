import { Logger } from 'openloops/common'
import { ListUsersByProps } from 'openloops/users'
import { CurrentUser } from 'openloops/base'

/**
 * Lists users by their properties, in pages. Only an admin can list other people.
 */
async function listUsers () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    // only admins can list the users of other people
    const result = await ListUsersByProps({
        where: { firstName: 'Jose' },
        options: { page: 1, limit: 10 },
        currentUser,
    })

    logger.info(result, '[Demo] Users:')
}

listUsers()
