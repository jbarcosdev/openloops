import 'reflect-metadata'
import { container } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { Logger } from '@common/logger'
import { CurrentUser, CurrentSession } from '@common/base'
import { CreateChatUseCase } from '@services/chats/lambdas/create-chat/'
import { UpdateChatUseCase } from '@services/chats/lambdas/update-chat/'
import { McpServer } from '@services/mcp-servers/entities'
import { ChatRepository } from '@services/chats/repositories'
import { Chat, ChatProps } from '@services/chats/entities/chat.entity'
import { ChatSettingsProps } from '@services/chats/entities/chat-settings.entity'
import { Tool } from '@tools/tool'
import { webSearchTool, callAiTool } from '@tools/core'
import { listMcpServersByUser } from '@services/mcp-servers'
import { rankToolsByKeywords, WeightedKeyword, ScoredTool } from './utils/rank-tools-by-keywords'
import { AgentLoop, AgentLoopNode, RunContext } from './agent-loop'
import { AgentStatus } from './agent-state'

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
    private readonly updateChatUseCase: UpdateChatUseCase = container.resolve(UpdateChatUseCase)
    private readonly chatRepository: ChatRepository = container.resolve(ChatRepository)
    private readonly logger = new Logger()

    private readonly _loop: AgentLoop
    private readonly _identity?: AgentIdentity
    private readonly maxIterations: number
    private _tools: Tool[]
    private _mcpTools: Tool[] = []
    private _mcps: McpServer[] = []
    private mcpLoading?: Promise<void>
    private _preHooks: Function[] = []
    private _postHooks: Function[] = []

    private currentChat: Chat
    private chatOptions?: ChatSettingsProps
    private currentUser?: CurrentUser
    private currentSession?: CurrentSession
    private currentMessage: string = ''
    private answerId: string = ''
    private replyCount = 0
    private stopLoop = false
    private stopRequested = false

    private pendingNextNode?: string

    static async interruptExecution (chatId: string, currentUser: CurrentUser): Promise<void> {
        const updateChatUseCase = container.resolve(UpdateChatUseCase)
        const logger = new Logger()

        logger.debug('[AGENT] Interrupt execution triggered')

        await updateChatUseCase.execute({
            id: chatId,
            payload: { state: { stopRequested: true } },
            currentUser,
        })
    }

    static async createChatSession (currentUser: CurrentUser, loop?: AgentLoop): Promise<Chat> {
        if (!currentUser) throw new Error('[AGENT] CurrentUser is required to create a new chat')

        const createChatUseCase = container.resolve(CreateChatUseCase)
        const newChat = Chat.withDefaults(loop?.name)

        const { data } = await createChatUseCase.execute({
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

            this.currentUser = currentUser
            this.currentSession = currentSession
            this.currentMessage = message
            this.chatOptions = options
            this.answerId = new ObjectId().toString()

            await this.preRunner(chatId)

            await this.runLoop()

            await this.postRunner()

            return { data: this.currentChat }
        } catch (error: any) {
            const message = error?.message ?? String(error)

            this.logger.error({ error: message, stack: error?.stack }, '[AGENT] Run failed')
            await this.failRun(message)

            return { data: this.currentChat?._id ? this.currentChat : undefined, error: message }
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

    private async preRunner (chatId?: string) {
        let chatData: ChatProps | undefined | null

        if (chatId) {
            chatData = await this.chatRepository?.findById(chatId)
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
        }

        this.currentChat.pushMessage({
            role: 'user',
            content: this.currentMessage,
        })

        if (this.chatOptions?.notifyOnCompletion) this.currentChat.settings?.setNotifyOnCompletion(true)
        if (this.chatOptions?.isPrivateSession) this.currentChat.settings?.setIsPrivateSession(true)
        if (this.chatOptions?.modelName) this.currentChat.settings?.setModelName(this.chatOptions.modelName)
        if (this.chatOptions?.loopName) this.currentChat.settings?.setLoopName(this.chatOptions.loopName)

        this.currentChat.state?.setStatus(AgentStatus.PROCESSING)
        this.currentChat.state?.setCurrentActivity('Starting...')
        await this.saveChat({ resetStop: true })

        for (const hook of this._preHooks) {
            await hook()
        }
    }

    private async postRunner () {
        for (const hook of this._postHooks) {
            await hook()
        }

        this.currentChat.state?.setCurrentActivity('stopped')
        await this.saveChat()
        await this.disconnectMcpServers()
    }

    private async failRun (message: string) {
        try {
            this.currentChat.state?.setStatus(AgentStatus.FAILED)
            this.currentChat.state?.setCurrentActivity('stopped')
            this.currentChat.state?.setLastError({ code: AGENT_ERROR_CODES.RUN_FAILED, message, isRetryable: true, timestamp: new Date() })
            this.currentChat.addTrace({ node: 'agent', reasoning: `Run failed: ${message}` })
            this.currentChat.failTask()
            await this.saveChat()
        } catch (saveError: any) {
            this.logger.error({ error: saveError?.message ?? saveError }, '[AGENT] Failed to persist failed run state')
        } finally {
            await this.disconnectMcpServers()
        }
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
            return
        }

        const results = await Promise.allSettled(servers.map(async props => {
            const mcpServer = McpServer.fromJSON(props)

            try {
                const mcpClient = await mcpServer.connect()
                const { tools: mcpTools } = await mcpClient.listTools()
                const tools = mcpTools.map(mcpTool => Tool.fromMcp(mcpTool, mcpClient, { namespace: mcpServer.name ?? 'mcp' }))

                return { mcpServer, tools }
            } catch (error) {
                this.logger.error({ error, mcpServer: mcpServer.name }, '[AGENT] Failed to connect MCP server')
                return undefined
            }
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

            await this.updateChatUseCase?.execute({
                id: this.currentChat?._id.toString(),
                payload: this.currentChat.toJSON(),
                currentUser: this.currentUser,
            }) ?? {}
        }
    }

    private async checkInterruptionRequest () {
        const chatId = this.currentChat?._id?.toString()
        const chatData = chatId && await this.chatRepository.findById(chatId, { state: 1 })

        if (chatData && chatData.state?.stopRequested) this.stopRequested = true
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
                this.currentChat.addTrace({ node: 'agent', reasoning: 'Iteration limit reached' })
                this.currentChat.failTask()

                this.stopLoop = true
                break
            }

            iterations++

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
                this.currentChat.addTrace({ node: nodeName ?? '', reasoning: 'Node not found' })

                this.stopLoop = true
                break
            }

            await nodeFn.call(this._loop, this.buildRunContext())

            await this.saveChat()

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

        const matchedTools = rankToolsByKeywords(keywords, this.tools)

        if (matchedTools.length <= 5 && !matchedTools.some(t => t.toolName === webSearchTool.name)) {
            matchedTools.push({ toolName: webSearchTool.name, score: 0.1, matchedKeywords: [], tool: webSearchTool })
        }

        if (matchedTools.length <= 5 && !matchedTools.some(t => t.toolName === callAiTool.name)) {
            matchedTools.push({ toolName: callAiTool.name, score: 0.1, matchedKeywords: [], tool: callAiTool })
        }

        const startIndex = (page - 1) * limit
        return matchedTools.slice(startIndex, startIndex + limit)
    }

    private reply (content: string): void {
        const isFirstReply = this.replyCount === 0

        this.replyCount++
        this.currentChat.pushMessage({ _id: isFirstReply ? this.answerId : undefined, answerId: this.answerId, role: 'assistant', content })
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
            baseParams: {
                currentUser: this.currentUser!,
                sessionId,
                answerId: this.answerId,
            },
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
