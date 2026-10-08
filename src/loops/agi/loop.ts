import { AgentLoop, AgentStatus, RunContext } from '@harness/index'
import { AgentTask } from '@services/tasks/entities/agent-task.entity'
import { fastResponder, confirmationGate } from '../shared/skills'
import { reactAgent } from './skills/reasoning-engine'

const MAX_TURNS = 20
const MAX_TOOL_CALLS = 40
const WARN_SAME_TOOL = 3
const MAX_SAME_TOOL = 6
const SUMMARY_CHARS = 400
const BLOCK_DUPLICATES = false

export class ReactLoop extends AgentLoop {
    get initialNode () {
        return this.nodes.fast_responder
    }

    get nodes () {
        return {
            fast_responder: this.fastResponder,
            react: this.react,
            execution_loop: this.executionLoop,
            request_confirmation: this.requestConfirmation,
            confirmation_gate: this.confirmationGate,
        }
    }

    get name () {
        return 'react'
    }

    get version () {
        return '1.0.0'
    }

    get author () {
        return {
            name: 'Jose Barcos',
            email: 'jose@openloops.xyz',
            website: 'https://openloops.xyz/jose'
        }
    }

    private context (ctx: RunContext) {
        const agentIdentity = ctx.identity
        const chatHistory = ctx.chat.lastHistoryMessages()

        return {
            ...(agentIdentity && Object.keys(agentIdentity)?.length ? { agentIdentity } : {}),
            ...(chatHistory?.length ? { chat_history: chatHistory } : {}),
        }
    }

    private async fastResponder (ctx: RunContext): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Analyzing requirement...')

        const chat_history = ctx.chat.lastHistoryMessages()
        const agentIdentity = ctx.identity

        const result = await fastResponder.run({
            ...ctx.skillParams,
            contextInjection: {
                ...(agentIdentity && Object.keys(agentIdentity)?.length ? { agentIdentity } : {}),
                ...(chat_history?.length ? { chat_history } : {}),
            },
        })

        ctx.chat.state?.setLanguage(result.detected_language)

        if (!result.can_answer) {
            ctx.setNextNode(this.nodes.react)
        } else {
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            ctx.setNextNode(this.nodes.fast_responder)
            ctx.reply(result.answer ?? '')
        }
    }

    private async react (ctx: RunContext): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Thinking...')

        const task = ctx.task ?? ctx.chat.createTask(ctx.currentMessage)
        task.answerQuestion(ctx.currentMessage)

        const streak = task.sameToolStreak
        const exhausted = task.turnCount >= MAX_TURNS || task.toolCallCount >= MAX_TOOL_CALLS
        const stuck = streak.count >= MAX_SAME_TOOL
        const stopReason = exhausted ? 'The task reached its limit of turns or tool calls' : stuck ? `The same tool (${streak.name}) was called ${streak.count} turns in a row without getting anywhere` : undefined
        const lastCompletedTask = ctx.chat.lastCompletedTask()
        const catalog = await ctx.toolCatalog()

        const result = await reactAgent.run({
            ...ctx.skillParams,
            history: task.history({
                budget: { turns_left: MAX_TURNS - task.turnCount, tool_calls_left: MAX_TOOL_CALLS - task.toolCallCount },
                ...(streak.count >= WARN_SAME_TOOL ? { warning: `You ran ${streak.name} ${streak.count} turns in a row. Do not repeat it with small rewordings: follow what its results suggest, change approach, or tell the user what is missing.` } : {}),
                ...(stopReason ? { stop_reason: stopReason } : {}),
            }),
            tools: catalog.tools,
            toolChoice: 'none',
            contextInjection: {
                ...this.context(ctx),
                ...catalog.context,
                ...(lastCompletedTask ? { last_completed_task: { goal: lastCompletedTask.goal, summary: lastCompletedTask.summary } } : {}),
            },
        })

        if (result.opening) task.opening = result.opening

        task.addTurn(result, { author: 'react', declaredTools: catalog.tools.map(tool => tool.name) })

        if (stopReason) {
            const answer = task.forceAnswer(`I could not finish the task: ${stopReason}.`)
            ctx.reply(answer)
            task.summary = answer.slice(0, SUMMARY_CHARS)
            ctx.chat.failTask(task.id)
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            ctx.setNextNode(this.nodes.fast_responder)
            return
        }

        ctx.setNextNode(this.nodes.execution_loop)
    }

    private async executionLoop (ctx: RunContext): Promise<void> {
        const task = ctx.task!

        const ready = task.readyActions
        const blocked = ready.filter(action => ctx.requiresApproval(action))
        const runnable = ready.filter(action => !blocked.includes(action))

        if (runnable.length) {
            ctx.chat.state?.setCurrentActivity(`Running ${runnable.map(action => action.name).join(', ')}...`)
            await Promise.all(runnable.map(action => ctx.runAction(action, { blockDuplicates: BLOCK_DUPLICATES })))
        }

        if (blocked.length) {
            ctx.setNextNode(this.nodes.request_confirmation)
            return
        }

        const question = task.pendingQuestion

        if (question) {
            ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
            ctx.setNextNode(this.nodes.react)
            ctx.reply(question)
            return
        }

        const answer = task.pendingAnswer

        if (answer !== undefined) {
            task.deliverAnswer()
            ctx.reply(answer)
            ctx.chat.completeTask(task.id, answer.slice(0, SUMMARY_CHARS))
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            ctx.setNextNode(this.nodes.fast_responder)
            return
        }

        ctx.setNextNode(this.nodes.react)
    }

    private async requestConfirmation (ctx: RunContext): Promise<void> {
        const task = ctx.task!
        const pending = task.readyActions.filter(action => ctx.requiresApproval(action))
        const catalog = await ctx.toolCatalog()

        const result = await reactAgent.run({
            ...ctx.skillParams,
            history: task.history({ pending_confirmation: pending.map(action => action.promptView()) }),
            tools: catalog.tools,
            toolChoice: 'none',
            contextInjection: { ...this.context(ctx), ...catalog.context },
        })

        const question = AgentTask.answerFrom(result) ?? `Do you confirm that I run ${pending.map(action => action.name).join(', ')}?`

        ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_CONFIRMATION)
        ctx.setNextNode(this.nodes.confirmation_gate)
        ctx.reply(question)
    }

    private async confirmationGate (ctx: RunContext): Promise<void> {
        const task = ctx.task!

        const result = await confirmationGate.run({
            ...ctx.skillParams,
            contextInjection: {
                ...(ctx.chat.lastAnswer ? { pending_confirmation: ctx.chat.lastAnswer } : {}),
            },
        })

        switch (result.decision) {
            case 'CONFIRMED':
                task.approvePending()
                ctx.chat.state?.setStatus(AgentStatus.PROCESSING)
                ctx.setNextNode(this.nodes.execution_loop)
                break

            case 'DECLINED':
                ctx.chat.cancelTask(task.id)
                ctx.chat.state?.setStatus(AgentStatus.IDLE)
                ctx.setNextNode(this.nodes.fast_responder)
                ctx.reply(result.acknowledgement)
                break

            case 'UNCLEAR':
            default:
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_CONFIRMATION)
                ctx.setNextNode(this.nodes.confirmation_gate)
                ctx.reply(result.clarification_prompt)
                break
        }
    }
}
