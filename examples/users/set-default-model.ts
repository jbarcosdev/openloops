import { Logger } from 'openloops/common'
import { updateUser } from 'openloops/users'
import { CurrentUser } from 'openloops/base'

/**
 * Sets the default model of the user, used when a run or a chat does not choose one.
 */
async function setDefaultModel () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    const result = await updateUser({
        id: '6ab56894eb20887d1ef7942c',
        payload: {
            preferences: {
                defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' },
            },
        },
        currentUser,
    })

    logger.info(result.preferences?.defaultModel, '[Demo] Default model:')
}

/**
 * Removes the default model of the user.
 */
async function removeDefaultModel () {
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    await updateUser({
        id: '6ab56894eb20887d1ef7942c',
        payload: {
            preferences: { defaultModel: null as any },
        },
        currentUser,
    })
}

setDefaultModel()

// removeDefaultModel()
