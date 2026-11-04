import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { deleteChat } from 'openloops/chats'

/**
 * Deletes a chat of the user without removing it from the database (soft delete).
 */
async function softDeleteChat () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await deleteChat({
        id: '6abc454162624f9e01929cd8',
        currentUser,
    })

    logger.info(result, '[Demo] Deleted chat')
}

/**
 * Removes a chat from the database for good. Only an admin can do it.
 */
async function hardDeleteChat () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await deleteChat({
        id: '6abc454162624f9e01929cd8',
        hardDelete: true, // only admins can perform this action
        currentUser,
    })

    logger.info(result, '[Demo] Deleted chat')
}

softDeleteChat()

// hardDeleteChat()
