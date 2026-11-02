import { Logger } from 'openloops/common'
import { ListUsersByProps } from 'openloops/users'
import { CurrentUser } from 'openloops/base'

async function listUsers () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await ListUsersByProps({
        where: { firstName: 'Jose' },
        options: { page: 1, limit: 10 },
        currentUser,
    })

    logger.info(result, '[Demo] Users:')
}

listUsers()
