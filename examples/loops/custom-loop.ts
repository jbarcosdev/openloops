import { Agent, AgentLoop, AgentStatus, Harness, RunContext } from 'openloops/core'
import { Logger } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { fastResponder } from 'openloops/loops'

export class EchoLoop extends AgentLoop {
    get initialNode () {
        return this.nodes.respond
    }

    get nodes () {
        return {
            respond: this.respond,
        }
    }

    get name () {
        return 'echo'
    }

    get version () {
        return '1.0.0'
    }

    get author () {
        return { name: 'You', email: 'you@example.com' }
    }

    private async respond (ctx: RunContext, harness: Harness): Promise<void> {
        const result = await fastResponder.run({ ...ctx.skillParams })

        ctx.chat.state?.setLanguage(result.detected_language)
        ctx.chat.state?.setStatus(AgentStatus.IDLE)
        harness.reply(result.answer ?? '')
    }
}

async function runCustomLoop () {
    const logger = new Logger()
    const currentUser = await CurrentUser.asyncFromDB('6ab56894eb20887d1ef7942c')

    if (!currentUser) throw new Error('[Demo] current user is not defined')

    const agent = new Agent({ loop: new EchoLoop() })
    const result = await agent.run({ input: { message: 'hi, how are you?' }, currentUser })

    logger.info(result.data?.lastAnswer, '[Demo] Result')
}

runCustomLoop()
