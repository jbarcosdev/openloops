import { Logger } from 'openloops/common'
import { updateUser } from 'openloops/users'
import { CurrentUser } from 'openloops/base'

async function updateUserExample () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')
    

    const result = await updateUser({
        id: '6ab56894eb20887d1ef7942c',
        payload: {
            firstName: 'Jose',
            lastName: 'Developer',
        },
        currentUser,
    })

    logger.info(result, '[Demo] Updated user:')
}

updateUserExample()
