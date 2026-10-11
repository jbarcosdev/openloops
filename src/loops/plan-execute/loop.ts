import { AgentLoop, AgentStatus, Harness, RunContext } from '@harness/index'
import { fastResponder } from '../shared/skills'
import {
    actionPlanner,
    stateObserver,
    finalResponder,
    strategyEngine,
    ResponseSchema as StrategySchema
} from './skills'

const MAX_STEP_RETRIES = 2
const MAX_REPLANS = 3
const MAX_TASK_ACTIONS = 25
const RETRY_BACKOFF_MS = 500
const HISTORY_OUTPUT_CHARS = 1500
const OBSERVER_OUTPUT_CHARS = 3000
const FINAL_OUTPUT_CHARS = 6000

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
        }
    }

    get name () {
        return 'plan_execute'
    }

    get version () {
        return '1.1.0'
    }

    get author () {
        return {
            name: 'Jose Barcos',
            email: 'jose@openloops.xyz',
            website: 'https://openloops.xyz/jose'
        }
    }

    private stopTask (ctx: RunContext, harness: Harness, reason: string): void {
        const task = ctx.task!

        task.skipPending()
        task.setScratch('stop_reason', reason)
        harness.setNextNode(this.nodes.final_responder)
    }

    private async fastResponder (ctx: RunContext, harness: Harness): Promise<void> {
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
            harness.setNextNode(this.nodes.strategy_engine)
        } else {
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            harness.setNextNode(this.nodes.fast_responder)
            harness.reply(result.answer ?? '')
        }
    }

    private async strategyEngine (ctx: RunContext, harness: Harness): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Designing strategy...')

        await harness.ensureTools()

        const lastCompletedTask = ctx.task ? undefined : ctx.chat.lastCompletedTask()
        const chatHistory = ctx.chat.lastHistoryMessages()
        const toolsMeta = ctx.tools?.map(tool => tool.meta)

        const result = await strategyEngine.run({
            ...ctx.skillParams,
            contextInjection: {
                user_goal: ctx.currentMessage,
                ...(toolsMeta?.length ? { toolsMeta } : {}),
                ...(chatHistory?.length ? { chat_history: chatHistory } : {}),
                ...(lastCompletedTask
                    ? { last_completed_task: { goal: lastCompletedTask.goal, summary: lastCompletedTask.summary } }
                    : {}),
            },
        })

        ctx.chat.state?.setLanguage(result.detected_language)

        const reopened = result.is_continuation && lastCompletedTask
            ? await harness.reopenTask(lastCompletedTask.id)
            : undefined

        const task = reopened ?? ctx.chat.createTask(result.goal ?? ctx.currentMessage)

        task.setScratch('strategy', result)

        harness.setNextNode(this.nodes.action_planner)
    }

    private async actionPlanner (ctx: RunContext, harness: Harness): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Creating action plan...')

        await harness.ensureTools()

        const task = ctx.task!
        const strategy = task.getScratch<StrategySchema>('strategy')
        const replanFeedback = task.getScratch<string>('replan_feedback')
        const history = task.executionHistory(HISTORY_OUTPUT_CHARS)

        const selectedNames = new Set<string>(strategy?.tool_names ?? [])
        const tools = ctx.tools?.filter(tool => selectedNames.has(tool.name)) ?? []

        const result = await actionPlanner.run({
            ...ctx.skillParams,
            contextInjection: {
                active_task: {
                    user_goal: task.goal,
                    strategy: strategy?.hypothesis,
                    required_capabilities: strategy?.required_capabilities,
                },
                ...(history.length ? { execution_history: history } : {}),
                ...(replanFeedback ? { replan_feedback: replanFeedback, replan_attempt: task.replanCount + 1 } : {}),
                tools,
            },
        })

        task.clearScratch('replan_feedback')

        const steps: any[] = result.steps ?? []
        const isExecutionPlan = result.plan_status === 'SUCCESS' || result.plan_status === 'NEEDS_CONFIRMATION'

        if (isExecutionPlan && steps.length && steps.every(step => task.hasExecuted(step.tool_name, step.arguments ?? step.args))) {
            this.stopTask(ctx, harness, 'The planner only proposed steps identical to ones already executed, so there is no new approach to try')
            return
        }

        const enqueueSteps = () => task.addPlan(steps.map(step => ({
            stepId: step.step_id,
            name: step.tool_name,
            args: step.arguments ?? step.args,
            dependsOn: step.depends_on_steps ?? step.depends_on,
            reasoning: step.rationale,
        })), 'action_planner')

        switch (result.plan_status) {
            case 'MISSING_TOOLS':
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
                ctx.chat.failTask(task.id)
                harness.setNextNode(undefined)
                harness.reply(result.user_response)
                break

            case 'NEEDS_CLARIFICATION':
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
                harness.setNextNode(undefined)
                harness.reply(result.clarification_prompt)
                break

            case 'NEEDS_CONFIRMATION': {
                const actions = enqueueSteps()
                const gated = actions.filter(action => harness.requiresApproval(action))

                await harness.requestApproval(gated.length ? gated : actions, { resumeAt: this.nodes.execution_loop })
                break
            }

            case 'SUCCESS':
                enqueueSteps()
                harness.setNextNode(this.nodes.execution_loop)
                break
        }
    }

    private async executionLoop (ctx: RunContext, harness: Harness): Promise<void> {
        await harness.ensureTools()

        const task = ctx.task!

        if (task.executedSinceOpen >= MAX_TASK_ACTIONS) {
            this.stopTask(ctx, harness, `The task reached the maximum of ${MAX_TASK_ACTIONS} executed actions`)
            return
        }

        const [next] = task.readyActions

        if (!next) {
            harness.setNextNode(this.nodes.final_responder)
            return
        }

        if (harness.requiresApproval(next)) {
            if (task.replanCount >= MAX_REPLANS) {
                this.stopTask(ctx, harness, `The step "${next.name}" needs the user's confirmation but the replan budget is exhausted`)
                return
            }

            task.setScratch('replan_feedback', `The step "${next.name}" uses a destructive tool and has not been confirmed by the user. Plan it again with plan_status NEEDS_CONFIRMATION and fill confirmation_details.`)
            harness.setNextNode(this.nodes.action_planner)
            return
        }

        ctx.chat.state?.setCurrentActivity(`Running ${next.name}...`)
        const executed = await harness.runAction(next)

        if (executed.canRetry && (executed.retries ?? 0) < MAX_STEP_RETRIES) {
            const retries = executed.incrementRetries()
            executed.resetForRetry()
            await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * retries))
            harness.setNextNode(this.nodes.execution_loop)
            return
        }

        harness.setNextNode(this.nodes.state_observer)
    }

    private async executionObserver (ctx: RunContext, harness: Harness): Promise<void> {
        const task = ctx.task!
        const lastAction = task.lastExecutedAction
        const replansRemaining = Math.max(0, MAX_REPLANS - task.replanCount)

        const result = await stateObserver.run({
            ...ctx.skillParams,
            contextInjection: {
                user_intent: task.goal,
                executed_step: lastAction?.promptView(OBSERVER_OUTPUT_CHARS),
                remaining_steps: task.readyActions.map(a => a.promptView()),
                replans_remaining: replansRemaining,
            },
        })

        ctx.chat.state?.setCurrentActivity(result.reasoning)

        switch (result.action) {
            case 'REPLAN':
                if (replansRemaining <= 0) {
                    this.stopTask(ctx, harness, `The replan budget is exhausted. Last diagnosis: ${result.feedback_for_planner}`)
                    break
                }

                task.setScratch('replan_feedback', result.feedback_for_planner)
                harness.setNextNode(this.nodes.action_planner)
                break

            case 'FINISH':
                task.skipPending()
                harness.setNextNode(this.nodes.final_responder)
                break

            case 'ASK_USER':
                ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
                harness.setNextNode(undefined)
                harness.reply(result.user_prompt ?? '')
                break

            case 'CONTINUE':
            default: {
                const stillPending = task.actions.some(a => a.status === 'pending')
                harness.setNextNode(stillPending ? this.nodes.execution_loop : this.nodes.final_responder)
                break
            }
        }
    }

    private async finalResponder (ctx: RunContext, harness: Harness): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Generating final response...')

        const task = ctx.task!
        const stopReason = task.getScratch<string>('stop_reason')
        const executionResults = task.executedActions.map(a => a.promptView(FINAL_OUTPUT_CHARS))

        const result = await finalResponder.run({
            ...ctx.skillParams,
            contextInjection: {
                user_goal: task.goal,
                execution_results: executionResults,
                ...(stopReason ? { stop_reason: stopReason } : {}),
            },
        })

        harness.reply(result.final_response ?? '')

        if (stopReason) {
            task.summary = result.reasoning
            ctx.chat.failTask(task.id)
        } else {
            ctx.chat.completeTask(task.id, result.reasoning)
        }

        ctx.chat.state?.setStatus(AgentStatus.IDLE)
        harness.setNextNode(this.nodes.fast_responder)
    }
}
