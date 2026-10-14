import 'reflect-metadata'
import { ObjectId } from 'mongodb'
import { Logger } from '@common/logger'
import { CurrentUser, CurrentSession } from '@common/base'
import { McpServer, McpServerProps, McpManifest, McpManifestDiff, needsUserReview } from '@services/mcp-servers/entities'
import { createChat, updateChat, getChatById } from '@services/chats'
import { Chat, ChatProps } from '@services/chats/entities/chat.entity'
import { ChatMessage } from '@services/chats/entities/chat-message.entity'
import { ChatSettingsProps, ExecutionMode } from '@services/chats/entities/chat-settings.entity'
import {
    createAgentTask,
    updateAgentTask,
    getAgentTaskById,
    listAgentTasksByChat,
    createAgentAction,
    updateAgentAction,
    listAgentActionsByTask,
} from '@services/tasks'
import { AgentTask, TaskStatus } from '@services/tasks/entities/agent-task.entity'
import { AgentAction } from '@services/tasks/entities/agent-action.entity'
import { createAgentTraces } from '@services/traces'
import { Tool } from '@tools/tool'
import { Guard, GuardResult, InputGuardContext } from '@guardrails/guard'
import { DEFAULT_MAX_INPUT_LENGTH, GUARD_FAILURE_REPLY } from '@common/constants'
import { approvalRequest, confirmationGate, mcpChangeReview, autonomousAnswer } from '@loops/shared/skills'
import { inputCheck } from '@guardrails/input/input-check'
import { createBlockInputOversize } from '@guardrails/input/create-block-input-oversize'
import { listAllMcpServersByUser, verifyMcpServerConnection, decideMcpServerTrust } from '@services/mcp-servers'
import { rankToolsByKeywords, WeightedKeyword, ScoredTool } from './utils/rank-tools-by-keywords'
import { AgentLoop, AgentLoopNode, Harness, RunContext } from './agent-loop'
import { AgentStatus } from './agent-state'
import { AgentWorkspace } from './workspace'
import { ToolPipeline, ToolPipelineRunOptions } from './tool-pipeline'
import { NATIVE_TOOLS } from './native-tools'
import { buildToolCatalog, isDeclarable, needsSearch, McpIndexEntry } from './tool-catalog'
import { LLMError } from '@clients/llm-error'

const MCP_CONNECT_RETRY_DELAYS_MS = [1000, 2000]
const MCP_DESCRIPTION_CHARS = 300
const MAX_AUTOMATIC_ANSWERS = 3
const AUTOMATIC_ANSWER_RESULTS = 5
const AUTOMATIC_ANSWER_RESULT_CHARS = 1500

type McpAccess = 'blocked' | 'not_connected' | 'unavailable' | 'ready' | 'first_use' | 'changed'

interface McpEntry {
    id: string
    name: string
    server: McpServer
    tools: Tool[]
    access: McpAccess
    hash?: string
    diff?: McpManifestDiff
    question?: string
    connection?: Promise<void>
}

export const AGENT_ERROR_CODES = {
    NODE_NOT_FOUND: 'AGENT_NODE_NOT_FOUND',
    RUN_FAILED: 'AGENT_RUN_FAILED',
    MAX_ITERATIONS_REACHED: 'AGENT_MAX_ITERATIONS_REACHED',
} as const

interface AgentIdentity {
    name?: string
    gender?: string
    role?: string
}

export interface AgentOptions {
    loop: AgentLoop
    tools?: Tool[]
    guards?: Guard[]
    maxInputLength?: number
    identity?: AgentIdentity
    maxIterations?: number
    strictMode?: boolean
}

interface ChatInput {
    message: string
    chatId?: string
    messageId?: string
}

type HookType = 'pre_execution' | 'post_execution'

const DEFAULT_MAX_ITERATIONS = 50

export class Agent {
    private readonly logger = new Logger()

    private readonly _loop: AgentLoop
    private readonly _identity?: AgentIdentity
    private readonly maxIterations: number
    private readonly strictMode: boolean
    private _tools: Tool[]
    private _mcps: McpEntry[] = []
    private mcpListing?: Promise<void>
    private mcpListingFailed = false
    private _preHooks: Function[] = []
    private _postHooks: Function[] = []
    private _guards: Guard[] = []
    private awaitingConfirmation = false

    private currentChat: Chat
    private chatOptions?: ChatSettingsProps
    private currentUser?: CurrentUser
    private currentSession?: CurrentSession
    private currentMessage: string = ''
    private answerId: string = ''
    private userMessageId?: string
    private iteration = 0
    private replyCount = 0
    private stopLoop = false
    private stopRequested = false
    private workspace?: AgentWorkspace
    private pipeline?: ToolPipeline
    private readonly snapshots = new Map<string, string>()

    private pendingNextNode?: string

    static async interruptExecution (chatId: string, currentUser: CurrentUser): Promise<void> {
        const logger = new Logger()

        logger.debug('[AGENT] Interrupt execution triggered')

        await updateChat({
            id: chatId,
            payload: { state: { stopRequested: true } },
            currentUser,
        })
    }

    static async createChatSession (currentUser: CurrentUser, loop?: AgentLoop): Promise<Chat> {
        if (!currentUser) throw new Error('[AGENT] CurrentUser is required to create a new chat')

        const newChat = Chat.withDefaults(loop?.name)

        const { data } = await createChat({
            payload: newChat.toJSON(),
            currentUser,
        })

        if (!data) throw new Error('[AGENT] There was an error creating the chat')

        return Chat.fromJSON(data)
    }

    constructor (agentOptions: AgentOptions) {
        if (!agentOptions?.loop) throw new Error('[AGENT] An AgentLoop instance is required')

        this._loop = agentOptions.loop
        this._tools = agentOptions.tools ?? []
        this._identity = agentOptions.identity
        this.maxIterations = agentOptions.maxIterations ?? DEFAULT_MAX_ITERATIONS
        this.strictMode = agentOptions.strictMode ?? false

        this.addGuard(createBlockInputOversize(agentOptions.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH))
        this.addGuard(inputCheck)

        for (const guard of agentOptions.guards ?? []) this.addGuard(guard)

        this.currentChat = Chat.withDefaults(this._loop.name)
    }

    get tools () {
        return [...this._tools, ...this._mcps.flatMap(entry => entry.tools)]
    }

    get mcps () {
        return this._mcps.map(entry => entry.server)
    }

    private get executionMode (): ExecutionMode {
        return this.chatOptions?.executionMode ?? 'interactive'
    }

    get notifyOnCompletion () {
        return this.currentChat?.settings?.notifyOnCompletion
    }

    get lastAssistantAnswer () {
        return this.currentChat.lastAnswer
    }

    async run (props: { input: ChatInput; options?: ChatSettingsProps; currentUser: CurrentUser; currentSession?: CurrentSession }) {
        try {
            const { input, options, currentUser, currentSession } = props || {}
            const { chatId, message } = input || {}

            this.logger.debug(input, '[AGENT] Agent started')

            if (!this._loop?.nodes || !this._loop?.initialNode) throw new Error('[AGENT] Loop is missing')
            if (!message) throw new Error('[AGENT] Message is required')
            if (!currentUser) throw new Error('[AGENT] CurrentUser is required')

            this.stopLoop = false
            this.stopRequested = false
            this.pendingNextNode = undefined
            this.replyCount = 0
            this.mcpListing = undefined
            this.mcpListingFailed = false
            this._mcps = []
            this.workspace = undefined
            this.pipeline = undefined
            this.snapshots.clear()
            this.iteration = 0
            this.userMessageId = undefined
            this.awaitingConfirmation = false

            this.currentUser = currentUser
            this.currentSession = currentSession
            this.currentMessage = message
            this.chatOptions = options
            this.answerId = new ObjectId().toString()

            const proceed = await this.preRunner(chatId)

            if (proceed) {
                if (await this.resolveConfirmation()) await this.runLoop()

                await this.postRunner()
            } else {
                await this.finishBlocked()
            }

            return { data: this.currentChat }
        } catch (error: any) {
            const message = error?.message ?? String(error)

            this.logger.error({ error: message, stack: error?.stack }, '[AGENT] Run failed')
            const llmError = error instanceof LLMError ? error : undefined
            const reported = llmError?.userMessage ?? message

            await this.failRun(reported, llmError)

            return { data: this.currentChat?._id ? this.currentChat : undefined, error: reported }
        }
    }

    stopAgent () {
        this.stopLoop = true
    }

    addTool (tool: Tool) {
        this._tools.push(tool)
    }

    addHook (type: HookType, fn: Function) {
        if (type === 'pre_execution') this._preHooks.push(fn)
        if (type === 'post_execution') this._postHooks.push(fn)
    }

    addGuard (guard: Guard) {
        this._guards.push(guard)
    }

    private async preRunner (chatId?: string): Promise<boolean> {
        let chatData: ChatProps | undefined | null

        if (chatId) {
            const { data } = await getChatById({ id: chatId, currentUser: this.currentUser })
            chatData = data?._id ? data : undefined
        }

        if (!chatData) {
            this.logger.debug('[AGENT] Not existing chat found')

            if (!this.currentUser) throw new Error('[AGENT] CurrentUser params is required')

            this.currentChat = await Agent.createChatSession(this.currentUser, this._loop)
            this.currentChat.settings?.setExecutionMode(this.executionMode)
        } else {
            this.logger.debug('[AGENT] Existing chat found')
            this.currentChat = Chat.fromJSON(chatData)
            this.currentChat.state?.setStopRequested(false)

            this.currentChat.switchLoop(this._loop.name)

            await this.loadTasks()
        }

        const userMessage = this.currentChat.pushMessage({
            role: 'user',
            content: this.currentMessage,
        })
        this.userMessageId = userMessage._id?.toString()

        if (this.chatOptions?.notifyOnCompletion) this.currentChat.settings?.setNotifyOnCompletion(true)
        if (this.chatOptions?.isPrivateSession) this.currentChat.settings?.setIsPrivateSession(true)
        if (this.chatOptions?.modelProvider) this.currentChat.settings?.setModelProvider(this.chatOptions.modelProvider)
        if (this.chatOptions?.modelName) this.currentChat.settings?.setModelName(this.chatOptions.modelName)
        if (this.chatOptions?.loopName) this.currentChat.settings?.setLoopName(this.chatOptions.loopName)

        this.awaitingConfirmation = this.currentChat.state?.status === AgentStatus.AWAITING_USER_CONFIRMATION

        this.currentChat.state?.setStatus(AgentStatus.PROCESSING)
        this.currentChat.state?.setCurrentActivity('Starting...')
        await this.persist({ resetStop: true })

        if (!await this.runInputGuards(userMessage)) return false

        for (const hook of this._preHooks) {
            await hook()
        }

        return true
    }

    private async runInputGuards (userMessage: ChatMessage): Promise<boolean> {
        const guards = this._guards.filter(guard => guard.type === 'input')
        if (!guards.length) return true

        const ctx = this.buildRunContext()
        const context: InputGuardContext = {
            message: this.currentMessage,
            chat: ctx.chat,
            currentUser: ctx.currentUser,
            currentSession: ctx.currentSession,
            skillParams: ctx.skillParams,
            logger: ctx.logger,
        }

        for (const guard of guards) {
            let result: GuardResult
            let failed = false

            try {
                result = await guard.run(context)
            } catch (error: any) {
                this.logger.error({ error: error?.message ?? error, guard: guard.name }, '[AGENT] Guard failed')
                failed = true
                result = { passed: false, reason: `Guard failed: ${error?.message ?? error}` }
            }

            if (result.passed) continue

            const reply = failed ? GUARD_FAILURE_REPLY : guard.reply

            userMessage.excludeFromContext = true
            this.reply(`${reply}\n\nRef: ${guard.ref}`, true)
            this.currentChat.addTrace({ node: guard.name, kind: 'guard', reasoning: `${guard.type} guard, Ref ${guard.ref}: ${result.reason ?? 'Blocked'}` })

            return false
        }

        return true
    }

    private async finishBlocked () {
        this.currentChat.state?.setStatus(this.awaitingConfirmation ? AgentStatus.AWAITING_USER_CONFIRMATION : AgentStatus.IDLE)
        this.currentChat.state?.setCurrentActivity('stopped')
        await this.persist()
        await this.disconnectMcpServers()
    }

    private async requestApproval (actions: AgentAction[], resumeAt: string | AgentLoopNode): Promise<void> {
        const task = this.currentChat.activeTask
        if (!task) throw new Error('[AGENT] An active task is required to request approval')

        const ctx = this.buildRunContext()
        const gated = Array.from(new Set(actions.map(action => this.entryOf(action.name)).filter((entry): entry is McpEntry => !!entry && this.isGatedEntry(entry))))
        const destructive = actions.filter(action => this.tools.find(tool => tool.name === action.name)?.destructive && !action.approved)
        const questions: string[] = []

        for (const entry of gated) questions.push(entry.question || await this.askMcpReview(entry))

        for (const action of actions) {
            const entry = this.entryOf(action.name)
            if (entry && gated.includes(entry)) action.reviewedHash = entry.hash
        }

        if (destructive.length || !gated.length) {
            const pending = destructive.length ? destructive : actions

            const result = await approvalRequest.run({
                ...ctx.skillParams,
                input: { goal: task.goal, pending_actions: pending.map(action => action.promptView()) },
            })

            questions.push(typeof result.question === 'string' && result.question.trim()
                ? result.question
                : `Do you confirm that I run ${pending.map(action => action.name).join(', ')}?`)
        }

        task.setNextNode(this.resolveNodeName(resumeAt))
        this.currentChat.state?.setStatus(AgentStatus.AWAITING_USER_CONFIRMATION)

        if (this.executionMode === 'autonomous') {
            this.currentChat.addTrace({ node: 'autonomous_mode', kind: 'agent', reasoning: `Autonomous run paused until the user answers: ${actions.map(action => action.name).join(', ')} need approval`, taskId: task.id })
        }

        this.currentChat.addTrace({ node: 'approval_request', kind: 'agent', reasoning: `Asked for confirmation of ${actions.map(action => action.name).join(', ')}`, taskId: task.id })
        this.reply(questions.join('\n\n'))
    }

    private async resolveConfirmation (): Promise<boolean> {
        const task = this.currentChat.activeTask
        if (!this.awaitingConfirmation || !task) return true

        const ctx = this.buildRunContext()
        const pending = this.currentChat.lastAnswer

        const result = await confirmationGate.run({
            ...ctx.skillParams,
            contextInjection: { ...(pending ? { pending_confirmation: pending } : {}) },
        })

        switch (result.decision) {
            case 'CONFIRMED': {
                const pendingActions = task.actions.filter(action => action.status === 'pending')
                task.approvePending()
                await this.approveReviewedServers(pendingActions)
                this.currentChat.state?.setStatus(AgentStatus.PROCESSING)
                return true
            }

            case 'DECLINED':
                await this.blockReviewedServers(task.actions.filter(action => action.status === 'pending'))
                this.currentChat.cancelTask(task.id)
                this.currentChat.state?.setStatus(AgentStatus.IDLE)
                this.reply(result.acknowledgement)
                return false

            case 'UNCLEAR':
            default:
                this.currentChat.state?.setStatus(AgentStatus.AWAITING_USER_CONFIRMATION)
                this.reply(result.clarification_prompt)
                return false
        }
    }

    private async postRunner () {
        for (const hook of this._postHooks) {
            await hook()
        }

        this.currentChat.state?.setCurrentActivity('stopped')
        await this.persist()
        await this.disconnectMcpServers()
    }

    private async failRun (message: string, llmError?: LLMError) {
        try {
            this.currentChat.state?.setStatus(AgentStatus.FAILED)
            this.currentChat.state?.setCurrentActivity('stopped')
            this.currentChat.state?.setLastError({ code: llmError?.code ?? AGENT_ERROR_CODES.RUN_FAILED, message, isRetryable: llmError?.isRetryable ?? true, timestamp: new Date() })
            this.currentChat.addTrace({ node: 'agent', kind: 'agent', reasoning: `Run failed: ${message}` })
            this.currentChat.failTask()
            await this.persist()
        } catch (saveError: any) {
            this.logger.error({ error: saveError?.message ?? saveError }, '[AGENT] Failed to persist failed run state')
        } finally {
            await this.disconnectMcpServers()
        }
    }

    private fingerprint (entity: { toDocument: () => unknown }): string {
        return JSON.stringify(entity.toDocument())
    }

    private async loadTasks (): Promise<void> {
        const chatId = this.currentChat._id?.toString()
        if (!chatId) return

        const { data: taskDocs } = await listAgentTasksByChat({ chatId, currentUser: this.currentUser })
        const tasks = taskDocs.map(doc => AgentTask.fromJSON(doc)).reverse()

        const activeTaskId = this.currentChat.state?.activeTaskId

        if (activeTaskId && !tasks.some(task => task.id === activeTaskId)) {
            const { data } = await getAgentTaskById({ id: activeTaskId, currentUser: this.currentUser })
            if (data) tasks.push(AgentTask.fromJSON(data))
        }

        for (const task of tasks) {
            task.hydrated = false
            this.snapshots.set(`task:${task.id}`, this.fingerprint(task))
        }

        this.currentChat.tasks = tasks

        const finished = [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.ABANDONED]
        if (this.currentChat.activeTask?.status && finished.includes(this.currentChat.activeTask.status)) this.currentChat.state?.setActiveTaskId(undefined)

        const activeTask = this.currentChat.activeTask
        if (activeTask) await this.hydrateTask(activeTask)
    }

    private async hydrateTask (task: AgentTask): Promise<void> {
        if (task.hydrated) return

        const { data } = await listAgentActionsByTask({ taskId: task.id, currentUser: this.currentUser })
        const actions = data.map(doc => AgentAction.fromJSON(doc))

        for (const action of actions) this.snapshots.set(`action:${action.id}`, this.fingerprint(action))

        task.setActions(actions)
    }

    private async persistTask (task: AgentTask): Promise<void> {
        const key = `task:${task.id}`
        const current = this.fingerprint(task)
        const previous = this.snapshots.get(key)

        if (previous === current) return

        if (previous === undefined) {
            await createAgentTask({ payload: task.toJSON(), currentUser: this.currentUser })
        } else {
            await updateAgentTask({ id: task.id, payload: task.toJSON(), currentUser: this.currentUser })
        }

        this.snapshots.set(key, current)
    }

    private async persistAction (action: AgentAction): Promise<void> {
        const key = `action:${action.id}`
        const current = this.fingerprint(action)
        const previous = this.snapshots.get(key)

        if (previous === current) return

        if (previous === undefined) {
            await createAgentAction({ payload: action.toJSON(), currentUser: this.currentUser })
        } else {
            await updateAgentAction({ id: action.id, payload: action.toJSON(), currentUser: this.currentUser })
        }

        this.snapshots.set(key, current)
    }

    private async persistTasks (): Promise<void> {
        if (!this.currentChat._id) return

        for (const task of this.currentChat.tasks) {
            await this.persistTask(task)

            if (task.hydrated) await Promise.all(task.actions.map(action => this.persistAction(action)))
        }
    }

    private async flushTraces (): Promise<void> {
        const traces = this.currentChat.drainTraces()
        const chatId = this.currentChat._id

        if (!traces.length || !chatId) return

        try {
            await createAgentTraces({
                payload: traces.map(trace => ({
                    chatId,
                    taskId: trace.taskId,
                    node: trace.node,
                    reasoning: trace.reasoning,
                    timestamp: trace.timestamp,
                    answerId: this.answerId,
                    messageId: this.userMessageId,
                    kind: trace.kind ?? 'skill',
                    iteration: trace.iteration ?? this.iteration,
                    durationMs: trace.durationMs,
                })),
                currentUser: this.currentUser,
            })
        } catch (error: any) {
            this.logger.error({ error: error?.message ?? error }, '[AGENT] Failed to persist traces')
        }
    }

    private async persist (props?: { resetStop: boolean }): Promise<void> {
        await this.persistTasks()
        await this.saveChat(props)
        await this.flushTraces()
    }

    private ensureTools (): Promise<Tool[]> {
        this.mcpListing ??= this.listMcps()
        return this.mcpListing.then(() => this.tools)
    }

    private async listMcps (): Promise<void> {
        if (!this.currentUser) return

        try {
            const response = await listAllMcpServersByUser({ currentUser: this.currentUser })
            this._mcps = (response?.data ?? []).map(props => this.toMcpEntry(props))
        } catch (error: any) {
            this.logger.error({ error: error?.message ?? error }, '[AGENT] Failed to list MCP servers')
            this.mcpListingFailed = true
        }
    }

    private toMcpEntry (props: McpServerProps): McpEntry {
        const server = McpServer.fromJSON(props)

        return { id: String(props._id ?? ''), name: props.name ?? 'mcp', server, tools: [], access: server.trust === 'blocked' ? 'blocked' : 'not_connected' }
    }

    private mcpIndex (): McpIndexEntry[] {
        return this._mcps.map(entry => {
            if (entry.access === 'blocked') return { name: entry.name, state: 'blocked' }

            const approved = entry.access === 'ready' || (['not_connected', 'unavailable'].includes(entry.access) && entry.server.trust === 'approved')
            const description = entry.server.latest?.instructions?.slice(0, MCP_DESCRIPTION_CHARS)

            return { name: entry.name, ...(description ? { description } : {}), state: approved ? 'approved' : 'not_approved' }
        })
    }

    private entryOf (toolName?: string): McpEntry | undefined {
        return this._mcps
            .filter(entry => toolName?.startsWith(`${entry.name}__`))
            .sort((a, b) => b.name.length - a.name.length)[0]
    }

    private isGatedEntry (entry: McpEntry): boolean {
        return entry.access === 'first_use' || entry.access === 'changed'
    }

    private isGated (tool: Tool): boolean {
        if (tool.origin !== 'mcp') return false
        const entry = this._mcps.find(candidate => candidate.name === tool.server)
        return !!entry && this.isGatedEntry(entry)
    }

    private async connectOwnersOf (toolNames: Array<string | undefined>): Promise<void> {
        const entries = new Set(toolNames.map(name => this.entryOf(name)).filter((entry): entry is McpEntry => !!entry))
        await Promise.all([...entries].map(entry => this.connectMcp(entry)))
    }

    private connectMcp (entry: McpEntry): Promise<void> {
        if (entry.access === 'blocked') return Promise.resolve()

        entry.connection ??= this.openMcp(entry)

        return entry.connection
    }

    private async openMcp (entry: McpEntry): Promise<void> {
        for (let attempt = 0; attempt <= MCP_CONNECT_RETRY_DELAYS_MS.length; attempt++) {
            try {
                const client = await entry.server.connect()
                const { manifest, tools } = await entry.server.inspect(client)

                entry.tools = tools.map(tool => Tool.fromMcp(tool, client, { namespace: entry.name }))
                await this.reviewMcp(entry, manifest)

                return
            } catch (error) {
                this.logger.error({ error, mcpServer: entry.name, attempt: attempt + 1 }, '[AGENT] Failed to connect MCP server')
                await Promise.resolve().then(() => entry.server.disconnect()).catch(() => undefined)

                const delay = MCP_CONNECT_RETRY_DELAYS_MS[attempt]
                if (delay === undefined) break

                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }

        entry.tools = []
        entry.access = 'unavailable'
        this.currentChat?.addTrace({ node: 'agent', kind: 'agent', reasoning: `Tool source unavailable: ${entry.name}` })
    }

    private async reviewMcp (entry: McpEntry, live: McpManifest): Promise<void> {
        entry.hash = live.hash

        if (entry.server.latest?.hash !== live.hash) {
            try {
                const { data } = await verifyMcpServerConnection({ id: entry.id, currentUser: this.currentUser })
                this.refreshMcpServer(entry, data)
            } catch (error: any) {
                this.logger.error({ error: error?.message ?? error, mcpServer: entry.name }, '[AGENT] Failed to verify MCP server')
            }
        }

        const { server } = entry

        if (server.trust === 'approved' && server.approvedHash === live.hash) {
            entry.access = 'ready'
            return
        }

        entry.diff = server.diffAgainst(live)

        if (server.trust !== 'approved' || !server.approvedHash) {
            entry.access = 'first_use'
            return
        }

        entry.access = 'changed'

        if (this.strictMode || needsUserReview(entry.diff)) return

        const review = await this.runMcpReview(entry, false)

        if (review?.decision === 'APPROVE' && await this.decideMcp(entry, 'approve', live.hash)) {
            entry.access = 'ready'
            this.currentChat?.addTrace({ node: 'mcp_change_review', kind: 'agent', reasoning: `Approved a harmless change of tool source on behalf of the user: ${entry.name}` })
            return
        }

        if (review?.question?.trim()) entry.question = review.question
    }

    private async runMcpReview (entry: McpEntry, firstUse: boolean) {
        try {
            return await mcpChangeReview.run({
                ...this.buildRunContext().skillParams,
                input: { server_name: entry.name, first_use: firstUse, changes: entry.diff },
            })
        } catch (error: any) {
            this.logger.error({ error: error?.message ?? error, mcpServer: entry.name }, '[AGENT] Failed to review MCP server changes')
            return undefined
        }
    }

    private async askMcpReview (entry: McpEntry): Promise<string> {
        const firstUse = entry.access === 'first_use'
        const review = await this.runMcpReview(entry, firstUse)

        return review?.question?.trim() || `The tool server "${entry.name}" ${firstUse ? 'has not been approved yet' : 'changed since you approved it'}. Do you approve using it?`
    }

    private refreshMcpServer (entry: McpEntry, data: McpServerProps): void {
        const next = McpServer.fromJSON(data)
        next.mcpClient = entry.server.mcpClient
        entry.server = next
    }

    private async answerAutonomously (question: string): Promise<string | undefined> {
        const task = this.currentChat.activeTask
        if (this.executionMode !== 'autonomous' || !task) return undefined

        const trace = (reasoning: string) => this.currentChat.addTrace({ node: 'autonomous_answer', kind: 'agent', reasoning, taskId: task.id })

        if (task.automaticAnswers >= MAX_AUTOMATIC_ANSWERS) {
            trace(`The limit of ${MAX_AUTOMATIC_ANSWERS} automatic answers was reached, the task waits for the user`)
            return undefined
        }

        try {
            const result = await autonomousAnswer.run({
                ...this.buildRunContext().skillParams,
                input: {
                    goal: task.goal,
                    task_message: this.currentMessage,
                    known: task.known ?? {},
                    recent_results: task.executionHistory(AUTOMATIC_ANSWER_RESULT_CHARS).slice(-AUTOMATIC_ANSWER_RESULTS),
                    question,
                },
            })

            const answer = typeof result.answer === 'string' ? result.answer.trim() : ''

            if (result.decision === 'ANSWER' && answer) {
                trace('The question was answered automatically on behalf of the absent user')
                return answer
            }

            trace('The question cannot be answered from the context, the task waits for the user')
        } catch (error: any) {
            this.logger.error({ error: error?.message ?? error }, '[AGENT] Failed to answer a question automatically')
            trace('The automatic answer failed, the task waits for the user')
        }

        return undefined
    }

    private async decideMcp (entry: McpEntry, decision: 'approve' | 'block', manifestHash?: string): Promise<boolean> {
        try {
            const { data } = await decideMcpServerTrust({ id: entry.id, decision, manifestHash, currentUser: this.currentUser })
            this.refreshMcpServer(entry, data)
            return true
        } catch (error: any) {
            this.logger.error({ error: error?.message ?? error, mcpServer: entry.name, decision }, '[AGENT] Failed to decide MCP server trust')
            return false
        }
    }

    private reviewedEntries (actions: AgentAction[]): Array<{ entry: McpEntry, hash: string }> {
        const found = new Map<McpEntry, string>()

        for (const action of actions) {
            const entry = this.entryOf(action.name)
            if (entry && action.reviewedHash && !found.has(entry)) found.set(entry, action.reviewedHash)
        }

        return [...found].map(([entry, hash]) => ({ entry, hash }))
    }

    private async approveReviewedServers (pending: AgentAction[]): Promise<void> {
        await this.ensureTools()

        for (const { entry, hash } of this.reviewedEntries(pending)) await this.decideMcp(entry, 'approve', hash)

        await this.connectOwnersOf(pending.map(action => action.name))
    }

    private async blockReviewedServers (pending: AgentAction[]): Promise<void> {
        await this.ensureTools()

        for (const { entry } of this.reviewedEntries(pending)) {
            if (await this.decideMcp(entry, 'block')) entry.access = 'blocked'
        }
    }

    private async disconnectMcpServers (): Promise<void> {
        await this.mcpListing?.catch(() => undefined)

        const entries = this._mcps

        this._mcps = []
        this.mcpListing = undefined

        await Promise.allSettled(entries.map(async entry => {
            await entry.connection?.catch(() => undefined)
            await entry.server.disconnect().catch(error => {
                this.logger.error({ error, mcpServer: entry.name }, '[AGENT] Failed to disconnect MCP server')
            })
        }))
    }

    private async saveChat (props?: { resetStop: boolean }) {
        if (this.currentChat?._id) {
            this.logger.debug('[AGENT] Updating chat...')

            if (!props?.resetStop) {
                this.logger.debug('[Agent] Removing stopRequested')
                delete this.currentChat.state?.stopRequested
            }

            await updateChat({
                id: this.currentChat._id.toString(),
                payload: this.currentChat.toJSON(),
                currentUser: this.currentUser,
            })
        }
    }

    private async checkInterruptionRequest () {
        const chatId = this.currentChat?._id?.toString()
        if (!chatId) return

        const { data } = await getChatById({ id: chatId, select: { state: 1 }, currentUser: this.currentUser })

        if (data?.state?.stopRequested) this.stopRequested = true
    }

    private async runLoop () {
        this.logger.info('[AGENT] Agent Loop started')

        let iterations = 0

        while (!this.stopLoop) {
            if (iterations >= this.maxIterations) {
                this.logger.error({ maxIterations: this.maxIterations, loop: this._loop.name }, '[AGENT] Iteration limit reached')

                this.currentChat.state?.setStatus(AgentStatus.FAILED)
                this.currentChat.state?.setLastError({
                    code: AGENT_ERROR_CODES.MAX_ITERATIONS_REACHED,
                    message: `The agent loop "${this._loop.name}" reached the limit of ${this.maxIterations} iterations`,
                    isRetryable: false,
                    timestamp: new Date(),
                })
                this.currentChat.addTrace({ node: 'agent', kind: 'agent', reasoning: 'Iteration limit reached' })
                this.currentChat.failTask()

                this.stopLoop = true
                break
            }

            iterations++
            this.iteration = iterations

            await this.checkInterruptionRequest()
            if (this.stopRequested) {
                this.stopLoop = true
                this.currentChat.state?.setStatus(AgentStatus.IDLE)
                this.resetNextNode()
                this.currentChat.state?.setStopRequested(false)
                break
            }

            const activeTask = this.currentChat.activeTask
            const nodeName = activeTask?.nextNode ?? this.pendingNextNode ?? this.resolveNodeName(this._loop.initialNode)
            const nodeFn = nodeName ? this._loop.nodes[nodeName] : undefined

            if (!nodeFn) {
                this.logger.error({ nodeName, loop: this._loop.name }, '[AGENT] Node not found in current loop')

                this.currentChat.state?.setStatus(AgentStatus.FAILED)
                this.currentChat.state?.setLastError({
                    code: AGENT_ERROR_CODES.NODE_NOT_FOUND,
                    message: `Node "${nodeName}" is not implemented by loop "${this._loop.name}"`,
                    isRetryable: false,
                    timestamp: new Date(),
                })
                this.currentChat.addTrace({ node: nodeName ?? '', kind: 'agent', reasoning: 'Node not found' })

                this.stopLoop = true
                break
            }

            const startedAt = Date.now()
            await nodeFn.call(this._loop, this.buildRunContext(), this.buildHarness())
            this.currentChat.addTrace({ node: nodeName!, kind: 'node', durationMs: Date.now() - startedAt, taskId: activeTask?.id })

            await this.persist()

            if (
                !this.currentChat.state ||
                this.currentChat.state?.status === AgentStatus.IDLE ||
                this.currentChat.state?.status === AgentStatus.FAILED ||
                this.currentChat.state?.status === AgentStatus.AWAITING_USER_INPUT ||
                this.currentChat.state?.status === AgentStatus.AWAITING_USER_CONFIRMATION
            ) {
                this.stopLoop = true
                break
            }
        }

        if (this.currentChat.state?.status === AgentStatus.PROCESSING) this.currentChat.state.setStatus(AgentStatus.IDLE)

        this.logger.info('[AGENT] Agent Loop stopped')
    }

    private resetNextNode (): void {
        const resolved = this.resolveNodeName(this._loop.initialNode)
        const active = this.currentChat.activeTask
        if (active) active.setNextNode(resolved)
        else this.pendingNextNode = resolved
    }

    private resolveNodeName (node?: string | AgentLoopNode): string | undefined {
        if (typeof node !== 'function') return node
        return Object.entries(this._loop.nodes).find(([, fn]) => fn === node)?.[0]
    }

    private async searchTools (keywords: WeightedKeyword[], opts?: { page?: number; limit?: number; server?: string }): Promise<ScoredTool[]> {
        this.logger.debug({ opts }, '[AGENT] Searching tools')
        await this.ensureTools()

        const page = opts?.page ?? 1
        const limit = opts?.limit ?? 5
        let pool: Tool[]

        if (opts?.server) {
            const entry = this._mcps.find(candidate => candidate.name === opts.server)

            if (!entry) throw new Error(`There is no server named "${opts.server}". Available servers: ${this._mcps.map(candidate => candidate.name).join(', ') || 'none'}`)
            if (entry.access === 'blocked') throw new Error(`The server "${entry.name}" is blocked by the user: its tools cannot be listed or used`)

            await this.connectMcp(entry)

            if (entry.access === 'unavailable') throw new Error(`The server "${entry.name}" is unavailable right now, try again later`)

            pool = entry.tools.filter(isDeclarable)
        } else {
            await Promise.all(this._mcps.map(entry => this.connectMcp(entry)))
            pool = this.tools.filter(isDeclarable)
        }

        const matchedTools = keywords.length
            ? rankToolsByKeywords(keywords, pool)
            : pool.map(tool => ({ toolName: tool.name, score: 0, matchedKeywords: [], tool }))

        const startIndex = (page - 1) * limit
        return matchedTools.slice(startIndex, startIndex + limit)
    }

    private reply (content: string, excludeFromContext?: boolean): void {
        const isFirstReply = this.replyCount === 0

        this.replyCount++
        this.currentChat.pushMessage({ _id: isFirstReply ? this.answerId : undefined, answerId: this.answerId, role: 'assistant', content, excludeFromContext })
    }

    private get baseParams () {
        return {
            currentUser: this.currentUser!,
            sessionId: this.currentChat._id?.toString() ?? '',
            answerId: this.answerId,
        }
    }

    private getWorkspace (): AgentWorkspace {
        this.workspace ??= new AgentWorkspace(this.currentChat._id!.toString(), this.currentUser!, this.answerId)
        return this.workspace
    }

    private getPipeline (): ToolPipeline {
        this.pipeline ??= new ToolPipeline({
            workspace: this.getWorkspace(),
            tools: () => this.tools,
            searchTools: (keywords, opts) => this.searchTools(keywords, opts),
            searchEnabled: () => needsSearch(this.tools) || this._mcps.length > 0,
            isGated: tool => this.isGated(tool),
            baseParams: this.baseParams,
            logger: this.logger,
        })

        return this.pipeline
    }

    private async runAction (action: AgentAction, opts?: ToolPipelineRunOptions): Promise<AgentAction> {
        await this.ensureTools()
        await this.connectOwnersOf([action.name])

        const task = this.currentChat.activeTask
        if (!task) throw new Error('[AGENT] There is no active task to run the action in')

        return this.getPipeline().run(task, action, opts)
    }

    private async reopenTask (taskId: string): Promise<AgentTask | undefined> {
        const task = this.currentChat.getTask(taskId)
        if (!task) return undefined

        await this.hydrateTask(task)

        return this.currentChat.reopenTask(taskId)
    }

    private buildRunContext (): RunContext {
        const sessionId = this.currentChat._id?.toString() ?? ''
        const agent = this

        return {
            identity: this._identity,
            task: this.currentChat.activeTask,
            chat: this.currentChat,
            chatOptions: this.chatOptions,
            currentUser: this.currentUser!,
            currentSession: this.currentSession,
            currentMessage: this.currentMessage,
            answerId: this.answerId,
            get tools () {
                return agent.tools
            },
            baseParams: this.baseParams,
            skillParams: {
                provider: this.chatOptions?.modelProvider,
                modelName: this.chatOptions?.modelName,
                sessionId,
                answerId: this.answerId,
                userMessage: this.currentMessage,
                currentUser: this.currentUser,
                currentSession: this.currentSession,
                chat: this.currentChat,
            },
            logger: this.logger,
        }
    }

    private buildHarness (): Harness {
        return {
            executionMode: this.executionMode,
            answerQuestion: question => this.answerAutonomously(question),
            ensureTools: () => this.ensureTools(),
            searchTools: this.searchTools.bind(this),
            toolCatalog: async () => {
                await this.ensureTools()

                const discovered = this.currentChat.activeTask?.discoveredToolNames ?? []
                await this.connectOwnersOf(discovered)

                const catalog = buildToolCatalog(this.tools, NATIVE_TOOLS, discovered, this.mcpIndex())
                const unavailable = [...(this.mcpListingFailed ? ['configured tool servers'] : []), ...this._mcps.filter(entry => entry.access === 'unavailable').map(entry => entry.name)]

                return unavailable.length ? { ...catalog, context: { ...catalog.context, unavailable_sources: unavailable } } : catalog
            },
            workspace: this.getWorkspace(),
            runAction: (action, opts) => this.runAction(action, opts),
            requiresApproval: action => this.getPipeline().requiresApproval(action),
            requestApproval: (actions, opts) => this.requestApproval(actions, opts.resumeAt),
            reopenTask: taskId => this.reopenTask(taskId),
            reply: content => this.reply(content),
            setNextNode: node => {
                const resolved = this.resolveNodeName(node)
                const active = this.currentChat.activeTask
                if (active) active.setNextNode(resolved)
                else this.pendingNextNode = resolved
            },
        }
    }
}
