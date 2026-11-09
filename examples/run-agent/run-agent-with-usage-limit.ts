import { Agent, UsageLimit } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

/**
 * 1. THE LIMIT BELONGS TO YOUR APPLICATION.
 *
 * `openloops` does not know your plans: you choose the amount and the period for each user and pass it in the run. Here a free
 * user can spend 10 cents a month and a paying user 1 dollar a month.
 */
const FREE_LIMIT: UsageLimit = { maxCostUsd: 0.1, period: 'month' }
const PAID_LIMIT: UsageLimit = { maxCostUsd: 1, period: 'month' }

async function runAgentWithUsageLimit () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const isPaying = false
    const agent = new Agent({ loop: new AgiLoop() })

    /**
     * 2. PASS IT IN THE RUN.
     *
     * Before the run starts, `openloops` adds the cost of every model call of the user in the period, from any chat. If the total
     * is equal to or greater than `maxCostUsd`, the run does not start: nothing calls the model. When the run continues a chat
     * (`chatId`), the message is saved in it with no answer, so the user can say `continue` when the limit is lifted. A run that
     * starts under the limit finishes, even if it goes over it.
     */
    const result = await agent.run({
        input: { message: 'hi, how are you?' },
        currentUser,
        usageLimit: isPaying ? PAID_LIMIT : FREE_LIMIT,
    })

    /**
     * 3. HANDLE THE REJECTION.
     *
     * `agent.run` does not throw. A blocked run comes back with `errorCode: 'USAGE_LIMIT_REACHED'`, the amounts in `usageLimit`
     * and, when it continued a chat, the chat in `data` with the saved message. Answer your client with the status that fits, for example 429, and let the app show its own message. This
     * rejection is expected, so it is not sent to the error reporter.
     */
    if (result.errorCode === 'USAGE_LIMIT_REACHED') {
        const { used, limit, period } = result.usageLimit!

        logger.info({ used, limit, period }, '[Demo] The user reached the limit of the period')
        return
    }

    logger.info({ error: result.error, answer: result.data?.lastAnswer }, '[Demo] Run')
}

runAgentWithUsageLimit()
