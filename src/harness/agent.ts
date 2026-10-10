import 'reflect-metadata'
import { ObjectId } from 'mongodb'
import { Logger } from '@common/logger'
import { CurrentUser, CurrentSession } from '@common/base'
import { McpServer } from '@services/mcp-servers/entities'
import { createChat, updateChat, getChatById } from '@services/chats'
import { Chat, ChatProps } from '@services/chats/entities/chat.entity'
import { ChatMessage } from '@services/chats/entities/chat-message.entity'
import { ChatSettingsProps } from '@services/chats/entities/chat-settings.entity'
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
import { inputCheck } from '@guardrails/input/input-check'
import { createBlockInputOversize } from '@guardrails/input/create-block-input-oversize'
import { listMcpServersByUser } from '@services/mcp-servers'
import { rankToolsByKeywords, WeightedKeyword, ScoredTool } from './utils/rank-tools-by-keywords'
import { AgentLoop, AgentLoopNode, RunContext } from './agent-loop'
import { AgentStatus } from './agent-state'
import { AgentWorkspace } from './workspace'
import { ToolPipeline, ToolPipelineRunOptions } from './tool-pipeline'
import { NATIVE_TOOLS } from './native-tools'
import { buildToolCatalog, isDeclarable } from './tool-catalog'
import { LLMError } from '@clients/llm-error'

const MCP_CONNECT_RETRY_DELAYS_MS = [1000, 2000]
const DEFAULT_MAX_INPUT_LENGTH = 100_000
const GUARD_FAILURE_REPLY = 'The request could not be processed.'

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
    private _tools: Tool[]
    private _mcpTools: Tool[] = []
    private _mcps: McpServer[] = []
    private mcpLoading?: Promise<void>
    private _unavailableSources: string[] = []
    private _preHooks: Function[] = []
    private _postHooks: Function[] = []
    private _guards: Guard[] = []

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

        this.addGuard(createBlockInputOversize(agentOptions.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH))
        this.addGuard(inputCheck)

        for (const guard of agentOptions.guards ?? []) this.addGuard(guard)

        this.currentChat = Chat.withDefaults(this._loop.name)
    }

    get tools () {
        return [...this._tools, ...this._mcpTools]
    }

    get mcps () {
        return this._mcps
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
            this.mcpLoading = undefined
            this._mcpTools = []
            this._unavailableSources = []
            this.workspace = undefined
            this.pipeline = undefined
            this.snapshots.clear()
            this.iteration = 0
            this.userMessageId = undefined

            this.currentUser = currentUser
            this.currentSession = currentSession
            this.currentMessage = message
            this.chatOptions = options
            this.answerId = new ObjectId().toString()

            const proceed = await this.preRunner(chatId)

            if (proceed) {
                await this.runLoop()

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
        if (this.chatOptions?.modelName) this.currentChat.settings?.setModelName(this.chatOptions.modelName)
        if (this.chatOptions?.loopName) this.currentChat.settings?.setLoopName(this.chatOptions.loopName)

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
        this.currentChat.state?.setStatus(AgentStatus.IDLE)
        this.currentChat.state?.setCurrentActivity('stopped')
        await this.persist()
        await this.disconnectMcpServers()
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
        this.mcpLoading ??= this.loadMcpServers()
        return this.mcpLoading.then(() => this.tools)
    }

    private async loadMcpServers (): Promise<void> {
        if (!this.currentUser) return

        let servers: any[] = []

        try {
            const response = await listMcpServersByUser({ currentUser: this.currentUser })
            servers = response?.data ?? []
        } catch (error: any) {
            this.logger.error({ error: error?.message ?? error }, '[AGENT] Failed to list MCP servers')
            this._unavailableSources.push('configured tool servers')
            return
        }

        const results = await Promise.allSettled(servers.map(async props => {
            const mcpServer = McpServer.fromJSON(props)

            for (let attempt = 0; attempt <= MCP_CONNECT_RETRY_DELAYS_MS.length; attempt++) {
                try {
                    const mcpClient = await mcpServer.connect()
                    const { tools: mcpTools } = await mcpClient.listTools()
                    const tools = mcpTools.map(mcpTool => Tool.fromMcp(mcpTool, mcpClient, { namespace: mcpServer.name ?? 'mcp' }))

                    return { mcpServer, tools }
                } catch (error) {
                    this.logger.error({ error, mcpServer: mcpServer.name, attempt: attempt + 1 }, '[AGENT] Failed to connect MCP server')
                    await Promise.resolve().then(() => mcpServer.disconnect()).catch(() => undefined)

                    const delay = MCP_CONNECT_RETRY_DELAYS_MS[attempt]
                    if (delay === undefined) break

                    await new Promise(resolve => setTimeout(resolve, delay))
                }
            }

            this._unavailableSources.push(mcpServer.name ?? 'mcp')
            this.currentChat?.addTrace({ node: 'agent', kind: 'agent', reasoning: `Tool source unavailable: ${mcpServer.name ?? 'mcp'}` })

            return undefined
        }))

        for (const result of results) {
            if (result.status === 'rejected') {
                this.logger.error({ error: result.reason }, '[AGENT] Failed to load MCP server')
                continue
            }

            if (!result.value) continue

            this._mcpTools.push(...result.value.tools)
            this._mcps.push(result.value.mcpServer)
        }
    }

    private async disconnectMcpServers (): Promise<void> {
        await this.mcpLoading?.catch(() => undefined)

        const servers = this._mcps

        this._mcps = []
        this._mcpTools = []
        this.mcpLoading = undefined

        await Promise.allSettled(servers.map(mcpServer => mcpServer.disconnect().catch(error => {
            this.logger.error({ error, mcpServer: mcpServer.name }, '[AGENT] Failed to disconnect MCP server')
        })))
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
            await nodeFn.call(this._loop, this.buildRunContext())
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

    private searchTools (keywords: WeightedKeyword[], opts?: { page?: number; limit?: number }): ScoredTool[] {
        this.logger.debug({ opts }, '[AGENT] Searching tools')
        const page = opts?.page ?? 1
        const limit = opts?.limit ?? 5

        const matchedTools = rankToolsByKeywords(keywords, this.tools.filter(isDeclarable))

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
            baseParams: this.baseParams,
            logger: this.logger,
        })

        return this.pipeline
    }

    private async runAction (action: AgentAction, opts?: ToolPipelineRunOptions): Promise<AgentAction> {
        await this.ensureTools()

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
            ensureTools: () => this.ensureTools(),
            searchTools: this.searchTools.bind(this),
            toolCatalog: async () => {
                const catalog = buildToolCatalog(await this.ensureTools(), NATIVE_TOOLS, this.currentChat.activeTask?.discoveredToolNames ?? [])

                return this._unavailableSources.length ? { ...catalog, context: { ...catalog.context, unavailable_sources: this._unavailableSources } } : catalog
            },
            workspace: this.getWorkspace(),
            runAction: (action, opts) => this.runAction(action, opts),
            requiresApproval: action => this.getPipeline().requiresApproval(action),
            reopenTask: taskId => this.reopenTask(taskId),
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
            reply: (content) => this.reply(content),
            setNextNode: (node) => {
                const resolved = this.resolveNodeName(node)
                const active = this.currentChat.activeTask
                if (active) active.setNextNode(resolved)
                else this.pendingNextNode = resolved
            },
            logger: this.logger,
        }
    }
}
