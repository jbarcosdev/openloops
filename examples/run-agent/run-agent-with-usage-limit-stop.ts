import { Agent, AgentStatus } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

/**
 * Stops a run in the middle when the user passes the limit.
 *
 * By default the limit is checked only before the run starts, so a long run that starts under the limit finishes even if it
 * goes over it. `stopOnUsageLimit` is an option of the agent, off by default, that checks the spend again before each iteration of
 * the loop. It costs one query per iteration, and it does nothing in a run without `usageLimit`.
 */
async function runAgentWithUsageLimitStop () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({ loop: new AgiLoop(), stopOnUsageLimit: true })

    const result = await agent.run({
        input: { message: 'research the latest news about electric cars and write a summary' },
        currentUser,
        usageLimit: { maxCostUsd: 0.5, period: 'day' },
    })

    /**
     * A run stopped in the middle keeps its chat: it is saved as `failed` with the code `USAGE_LIMIT_REACHED`, which is not
     * retryable, and the result carries the same `errorCode` and `usageLimit` as a run blocked before it started. The only
     * difference is that `data` is the chat, with what the agent did until it stopped.
     */
    if (result.errorCode === 'USAGE_LIMIT_REACHED') {
        logger.info({
            usageLimit: result.usageLimit,
            started: Boolean(result.data),
            status: result.data?.state?.status === AgentStatus.FAILED ? 'stopped' : 'blocked',
            lastError: result.data?.state?.lastError?.code,
        }, '[Demo] The limit was reached')
        return
    }

    logger.info({ error: result.error, answer: result.data?.lastAnswer }, '[Demo] Run')
}

runAgentWithUsageLimitStop()
