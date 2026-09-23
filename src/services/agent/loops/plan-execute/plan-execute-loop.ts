import { AgentLoop, AgentStatus, RunContext } from '@services/agent/core'
import {
    fastResponder,
    strategyEngine,
    actionPlanner,
    stateObserver,
    finalResponder,
    confirmationGate,
} from '../shared/skills'

const MAX_STEP_RETRIES = 2

export class PlanExecuteLoop extends AgentLoop {
    get initialNode () {
        return this.nodes.fast_responder
    }

    get nodes () {
        return {
            fast_responder: this.fastResponder,
            strategy_engine: this.strategyEngine,
            action_planner: this.actionPlanner,
            execution_loop: this.executionLoop,
            state_observer: this.executionObserver,
            final_responder: this.finalResponder,
            confirmation_gate: this.confirmationGate,
        }
    }

    get name () {
        return 'plan_execute'
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

    private async fastResponder (ctx: RunContext): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Analyzing requirement...')

        const chat_history = ctx.chat.lastHistoryMessages()

        const result = await fastResponder.run({
            ...ctx.skillParams,
            contextInjection: {
                ...(chat_history?.length ? { chat_history } : {}),
            },
        })

        ctx.chat.state?.setLanguage(result.detected_language)

        if (!result.can_answer) {
            ctx.setNextNode(this.nodes.strategy_engine)
        } else {
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            ctx.setNextNode(this.nodes.fast_responder)
            ctx.reply(result.answer ?? '')
        }
    }

    private async strategyEngine (ctx: RunContext): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Designing strategy...')

        const lastCompletedTask = ctx.task ? undefined : ctx.chat.lastCompletedTask()
        const chatHistory = ctx.chat.lastHistoryMessages()

        const result = await strategyEngine.run({
            ...ctx.skillParams,
            contextInjection: {
                user_goal: ctx.currentMessage,
                ...(chatHistory?.length ? { chat_history: chatHistory } : {}),
                ...(lastCompletedTask
                    ? { last_completed_task: { goal: lastCompletedTask.goal, summary: lastCompletedTask.summary } }
                    : {}),
            },
        })

        ctx.chat.state?.setLanguage(result.detected_language)

        const task = result.is_continuation && lastCompletedTask
            ? ctx.chat.reopenTask(lastCompletedTask.id)!
            : ctx.chat.createTask(result.goal ?? ctx.currentMessage)

        ctx.chat.context.addContext({
            taskId: task.id,
            meta: { name: 'strategy', type: 'artifact', shortDescription: 'High-level strategy for the active task' },
            content: result,
        })

        ctx.setNextNode(this.nodes.action_planner)
    }

    private async actionPlanner (ctx: RunContext): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Creating action plan...')

        const task = ctx.task!
        const strategy = ctx.chat.context.lastContext({ taskId: task.id, name: 'strategy' })?.content

        const tools = ctx.searchTools(strategy?.tool_keywords ?? [])

        const result = await actionPlanner.run({
            ...ctx.skillParams,
            contextInjection: {
                active_task: {
                    user_goal: task.goal,
                    strategy: strategy?.hypothesis,
                    required_capabilities: strategy?.required_capabilities,
                },
                tools,
            },
        })

        const enqueueSteps = (steps: any[]) => steps.map(step => task.addAction({
            name: step.tool_name,
            stepId: String(step.step_id),
            args: step.args ?? step.arguments,
            dependsOn: step.depends_on?.map(String),
            author: 'action_planner',
        }))

        switch (result.plan_status) {
            case 'MISSING_TOOLS':
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
                ctx.chat.failTask(task.id)
                ctx.setNextNode(undefined)
                ctx.reply(result.user_response)
                break

            case 'NEEDS_CLARIFICATION':
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
                ctx.setNextNode(undefined)
                ctx.reply(result.clarification_prompt)
                break

            case 'NEEDS_CONFIRMATION': {
                enqueueSteps(result.steps)

                const actionsList = (result.confirmation_details?.actions ?? [])
                    .map(action => `- ${action.description}`)
                    .join('\n')

                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_CONFIRMATION)
                ctx.setNextNode(this.nodes.confirmation_gate)
                ctx.reply([
                    result.clarification_prompt,
                    result.confirmation_details?.impact_summary,
                    actionsList,
                    result.confirmation_details?.confirm_label,
                ].filter(Boolean).join('\n\n'))
                break
            }

            case 'SUCCESS':
                enqueueSteps(result.steps)
                ctx.setNextNode(this.nodes.execution_loop)
                break
        }
    }

    private async executionLoop (ctx: RunContext): Promise<void> {
        const task = ctx.task!
        const [next] = task.readyActions

        if (!next) {
            ctx.setNextNode(this.nodes.final_responder)
            return
        }

        ctx.chat.state?.setCurrentActivity(`Running ${next.name}...`)
        const tool = ctx.tools.find(t => t.name === next.name)
        const executed = await task.runReadyAction(next.id, tool, ctx.chat.context, ctx.baseParams)

        if (executed.status === 'failed' && (executed.retries ?? 0) < MAX_STEP_RETRIES) {
            executed.incrementRetries()
            executed.resetForRetry()
            ctx.setNextNode(this.nodes.execution_loop)
            return
        }

        ctx.setNextNode(this.nodes.state_observer)
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

    private async executionObserver (ctx: RunContext): Promise<void> {
        const task = ctx.task!
        const lastAction = task.lastExecutedAction

        const result = await stateObserver.run({
            ...ctx.skillParams,
            contextInjection: {
                user_intent: task.goal,
                executed_step: lastAction?.toJSON(),
                remaining_steps: task.readyActions.map(a => a.toJSON()),
            },
        })

        ctx.chat.state?.setCurrentActivity(result.reasoning)

        switch (result.action) {
            case 'REPLAN':
                ctx.setNextNode(this.nodes.action_planner)
                break

            case 'ASK_USER':
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
                ctx.setNextNode(undefined)
                ctx.reply(result.user_prompt ?? '')
                break

            case 'CONTINUE':
            default: {
                const stillPending = task.actions.some(a => a.status === 'pending')
                ctx.setNextNode(stillPending ? this.nodes.execution_loop : this.nodes.final_responder)
                break
            }
        }
    }

    private async finalResponder (ctx: RunContext): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Generating final response...')

        const task = ctx.task!
        const executionResults = task.actions
            .map(a => ({ tool_name: a.name, args: a.args, output: a.output, status: a.status }))

        const result = await finalResponder.run({
            ...ctx.skillParams,
            contextInjection: {
                user_goal: task.goal,
                execution_results: executionResults,
            },
        })

        ctx.reply(result.final_response ?? '')

        ctx.chat.completeTask(task.id, result.reasoning)
        ctx.chat.state?.setStatus(AgentStatus.IDLE)
        ctx.setNextNode(this.nodes.fast_responder)
    }
}
