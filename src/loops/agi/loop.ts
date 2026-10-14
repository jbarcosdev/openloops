import { AgentLoop, AgentStatus, Harness, RunContext } from '@harness/index'
import { findInvoker } from '@services/tasks/entities/agent-task.entity'
import { fastResponder } from '../shared/skills'
import { ungroundedIdentifiers, UNGROUNDED_PHRASE } from '@harness/utils/grounding'
import { reasoningEngine } from './skills/reasoning-engine'

const MAX_TURNS = 20
const MAX_TOOL_CALLS = 40
const WARN_SAME_TOOL = 3
const MAX_SAME_TOOL = 6
const MAX_ANSWER_REJECTIONS = 1
const WARN_WORKSPACE_TURNS = 3
const MAX_WORKSPACE_TURNS = 7
const BLOCK_DUPLICATES = false

export class AgiLoop extends AgentLoop {
    get initialNode () {
        return this.nodes.fast_responder
    }

    get nodes () {
        return {
            fast_responder: this.fastResponder,
            reasoning_engine: this.reasoningEngine,
            action_engine: this.actionEngine,
        }
    }

    get name () {
        return 'agi'
    }

    get version () {
        return '1.6.1'
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
            harness.setNextNode(this.nodes.reasoning_engine)
        } else {
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            harness.setNextNode(this.nodes.fast_responder)
            harness.reply(result.answer ?? '')
        }
    }

    private async reasoningEngine (ctx: RunContext, harness: Harness): Promise<void> {
        ctx.chat.state?.setCurrentActivity('Thinking...')

        const task = ctx.task ?? ctx.chat.createTask(ctx.currentMessage)
        task.answerQuestion(ctx.currentMessage)

        const streak = task.sameToolStreak
        const exhausted = task.turnCount >= MAX_TURNS || task.toolCallCount >= MAX_TOOL_CALLS
        const workspaceTurns = task.workspaceStreak
        const stuck = streak.count >= MAX_SAME_TOOL
        const lost = workspaceTurns >= MAX_WORKSPACE_TURNS
        const warning = streak.count >= WARN_SAME_TOOL
            ? `You ran ${streak.name} ${streak.count} turns in a row. Do not repeat it with small rewordings: follow what its results suggest, change approach, or tell the user what is missing.`
            : workspaceTurns >= WARN_WORKSPACE_TURNS && !lost
                ? `You spent ${workspaceTurns} turns in a row only reading and saving notes. Stop handling data by hand: locate what you need with read_context using 'find', then act with a tool, or tell the user what is missing.`
                : undefined
        const stopReason = exhausted ? 'The task reached its limit of turns or tool calls' : stuck ? `The same tool (${streak.name}) was called ${streak.count} turns in a row without getting anywhere` : lost ? `${workspaceTurns} turns in a row went into reading and saving notes without running any tool` : undefined
        const lastCompletedTask = ctx.chat.lastCompletedTask()
        const catalog = await harness.toolCatalog()

        const result = await reasoningEngine.run({
            ...ctx.skillParams,
            history: task.history({
                budget: { turns_left: MAX_TURNS - task.turnCount, tool_calls_left: MAX_TOOL_CALLS - task.toolCallCount },
                ...(warning ? { warning } : {}),
                ...(task.known ? { known: task.known } : {}),
                ...(task.schemas ? { schemas: task.schemas } : {}),
                ...(stopReason ? { stop_reason: stopReason } : {}),
            }),
            tools: catalog.tools,
            contextInjection: {
                ...this.context(ctx),
                ...catalog.context,
                ...(harness.executionMode === 'autonomous' ? { execution_mode: 'autonomous' } : {}),
                ...(lastCompletedTask ? { last_completed_task: { goal: lastCompletedTask.goal, summary: lastCompletedTask.summary } } : {}),
            },
        })

        if (result.opening) task.opening = result.opening

        const { rawText, ...callInfo } = result.callInfo

        task.addTurn(result, {
            author: 'reasoning_engine',
            declaredTools: catalog.tools.map(tool => tool.name),
            invoker: findInvoker(catalog.tools),
            notJson: Boolean(rawText),
            meta: { ...callInfo, rawResponse: rawText, loopVersion: this.version, executionMode: harness.executionMode, costInUsd: result.costInUsd, blocks: callInfo.blocks > 1 ? callInfo.blocks : undefined },
        })

        if (stopReason) {
            const answer = task.forceAnswer(`I could not finish the task: ${stopReason}.`)
            harness.reply(answer)
            task.summary = answer
            ctx.chat.failTask(task.id)
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            harness.setNextNode(this.nodes.fast_responder)
            return
        }

        harness.setNextNode(this.nodes.action_engine)
    }

    private async actionEngine (ctx: RunContext, harness: Harness): Promise<void> {
        const task = ctx.task!

        const ready = task.readyActions
        const blocked = ready.filter(action => harness.requiresApproval(action))
        const runnable = ready.filter(action => !blocked.includes(action))

        if (runnable.length) {
            ctx.chat.state?.setCurrentActivity(`Running ${runnable.map(action => action.name).join(', ')}...`)
            await Promise.all(runnable.map(action => harness.runAction(action, { blockDuplicates: BLOCK_DUPLICATES })))
        }

        if (blocked.length) {
            await harness.requestApproval(blocked, { resumeAt: this.nodes.action_engine })
            return
        }

        const question = task.pendingQuestion

        if (question) {
            const answer = await harness.answerQuestion(question)

            if (answer !== undefined && task.answerQuestion(answer, { automatic: true })) {
                harness.setNextNode(this.nodes.reasoning_engine)
                return
            }

            ctx.chat.state?.setStatus(AgentStatus.AWAITING_USER_INPUT)
            harness.setNextNode(this.nodes.reasoning_engine)
            harness.reply(question)
            return
        }

        const answer = task.pendingAnswer

        if (answer !== undefined) {
            const invented = task.rejectedAnswers < MAX_ANSWER_REJECTIONS ? await ungroundedIdentifiers(task, harness.workspace, [answer]) : []

            if (invented.length) {
                task.rejectAnswer(`Your answer cites the identifier${invented.length > 1 ? 's' : ''} ${invented.map(id => `"${id}"`).join(', ')}, which ${invented.length > 1 ? 'were' : 'was'} ${UNGROUNDED_PHRASE}. Do not state values you did not get from a result or from the user: remove ${invented.length > 1 ? 'them' : 'it'}, or obtain ${invented.length > 1 ? 'them' : 'it'} with a tool, and answer again.`)
                harness.setNextNode(this.nodes.reasoning_engine)
                return
            }

            task.deliverAnswer()
            harness.reply(answer)
            ctx.chat.completeTask(task.id, answer)
            ctx.chat.state?.setStatus(AgentStatus.IDLE)
            harness.setNextNode(this.nodes.fast_responder)
            return
        }

        harness.setNextNode(this.nodes.reasoning_engine)
    }
}
