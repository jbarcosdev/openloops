import * as Sentry from '@sentry/node'
import { Agent } from 'openloops/core'
import { Logger, setErrorReporter } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'
import { listChatsByUser } from 'openloops/chats'

/**
 * 1. DECLARE THE REPORTER, ONCE.
 *
 * Do it when the process starts and before the first request: at the top of the file that starts your server, or in a file that
 * your server imports first. It is global to the process, so there is nothing to pass to the `Agent`, to the use cases or to the
 * runner of the automations: they find the reporter by themselves. If you declare it twice, the second replaces the first.
 *
 * The reporter receives the error and `details`. `details.source` is always there (`agent`, `mongo`, `automations` or
 * `openloops`), and `code`, `chatId` and `userId` come when they exist.
 */
Sentry.init({ dsn: process.env.MY_SENTRY_DSN })

setErrorReporter((error, details) => {
    if (details.code === 'LLM_RATE_LIMITED' || details.code === 'LLM_QUOTA_EXCEEDED') return

    Sentry.withScope(scope => {
        scope.setTag('source', details.source)
        if (details.userId) scope.setUser({ id: details.userId })
        scope.setExtras(details)
        Sentry.captureException(error)
    })
})

/**
 * 2. RUN YOUR CODE AS ALWAYS.
 *
 * Nothing below mentions the reporter. There is no option in the `Agent`, no wrapper around the use case and no try/catch added
 * to report.
 */
async function main () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({ loop: new AgiLoop() })

    const result = await agent.run({
        input: {
            message: 'hi, how are you?',
        },
        currentUser,
    })

    /**
     * `agent.run` does not throw. If the run fails, for example because the provider rejects the API key, openloops saves the
     * chat as `failed`, returns the message for the user in `result.error` and calls the reporter above with
     * `{ source: 'agent', code: 'LLM_AUTH_FAILED', chatId, userId }` (the code depends on what the provider answers).
     * A run that goes well never calls the reporter.
     */
    logger.info({ error: result.error, status: result.data?.state?.status }, '[Demo] Run')

    /**
     * A use case throws its errors and they reach this `catch`: you decide what to answer to your client. What the reporter
     * receives is what openloops catches by itself. A failed call to the database is one of those cases: the repository calls
     * the reporter with `{ source: 'mongo', collection: 'chats' }` and then throws the error. If this `catch` reported it too,
     * Sentry would get it twice, so report the errors of the database in one of the two places.
     */
    try {
        const chats = await listChatsByUser({ options: { page: 1, limit: 10 }, currentUser })

        logger.info(chats.items.map(chat => ({ id: chat._id, status: chat.state?.status })), '[Demo] Chats')
    } catch (error: any) {
        logger.error(error, '[Demo] The list could not be read')
    }
}

main()
