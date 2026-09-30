import { Logger } from 'openloops/common'
import { deleteUser } from 'openloops/users'
import { CurrentUser } from 'openloops/base'

async function softDeleteUser () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')
    

    const result = await deleteUser({
        id: '6ab56894eb20887d1ef7942c',
        accountDeletionReason: 'Just a demo', // optional
        currentUser,
    })

    logger.info(result, '[Demo] Deleted user')
}

async function hardDeleteUser () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')
    

    const result = await deleteUser({
        id: '6ab56894eb20887d1ef7942c',
        accountDeletionReason: 'Just a demo', // optional
        hardDelete: true, // only admins can perfomr this action
        currentUser,
    })

    logger.info('[Demo] User removed from DB')
}

softDeleteUser()

// hardDeleteUser()
