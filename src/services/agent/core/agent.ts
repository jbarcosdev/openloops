import 'reflect-metadata'
import { container } from 'tsyringe'
import { Logger } from '@common/logger'
import { CurrentUser, CurrentSession } from '@services/app/core'
import { CreateChatUseCase } from '@services/agent/modules/chats/lambdas/create-chat/'
import { UpdateChatUseCase } from '@services/agent/modules/chats/lambdas/update-chat/'
import { ListChatsByUserUseCase } from '@services/agent/modules/chats/lambdas/list-chats-by-user'
import { ListMcpServersByUserUseCase } from '@services/agent/modules/mcp-servers/lambdas/list-mcpservers-by-user'
import { McpServer, McpServerProps } from '@services/agent/modules/mcp-servers/entities'
import { CreateMcpServerUseCase } from '@services/agent/modules/mcp-servers/lambdas/create-mcpserver'
import { ChatRepository } from '@services/agent/modules/chats/repositories'
import { GetLLMUsageUseCase, Params as UsageParams, Output as UsageOutput } from '@services/agent/modules/llmcalls/lambdas/get-llm-usage'
import { QueryOptions } from '@common/repositories'
import { Chat, ChatProps } from '@services/agent/modules/chats/entities/chat.entity'
import { Tool } from '@services/agent/tools/tool'
import { webSearchTool, callAiTool } from '@services/agent/tools/core'
import { rankToolsByKeywords, WeightedKeyword, ScoredTool } from '@services/agent/utils/rank-tools-by-keywords'
import { AgentLoop, AgentLoopNode, RunContext } from './agent-loop'
import { AgentStatus } from './agent-state'

export const AGENT_ERROR_CODES = {
    NODE_NOT_FOUND: 'AGENT_NODE_NOT_FOUND',
} as const

export interface AgentOptions {
    loop: AgentLoop
    tools?: Tool[]
}

interface Input {
    message: string
    chatId?: string
    messageId?: string
    isPrivateSession?: boolean
}

type HookType = 'pre_execution' | 'post_execution'

const MAX_ITERATIONS = 50

export class Agent {
    private readonly updateChatUseCase: UpdateChatUseCase = container.resolve(UpdateChatUseCase)
    private readonly chatRepository: ChatRepository = container.resolve(ChatRepository)
    private readonly logger = new Logger()

    private readonly _loop: AgentLoop
    private _tools: Tool[]
    private _mcps: McpServer[] = []
    private _preHooks: Function[] = []
    private _postHooks: Function[] = []

    private currentChat: Chat
    private currentUser?: CurrentUser
    private currentSession?: CurrentSession
    private currentMessage: string = ''
    private answerId: string = ''
    private stopLoop = false
    private stopRequested = false

    private pendingNextNode?: string

    static async getChat (chatId: string): Promise<ChatProps | null> {
        const chatRepository = container.resolve(ChatRepository)
        return chatRepository.findById(chatId)
    }

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

    static async listUserChats (options: QueryOptions, currentUser: CurrentUser ): Promise<ChatProps[] | null | undefined> {
        const listChatsByUserUseCase = container.resolve(ListChatsByUserUseCase)
        const { page, limit } = options || {}

        const { data } = await listChatsByUserUseCase.execute({ 
			options: { page, limit },
			currentUser,
		})

        return data
    }

    static async getLLMUsage (filters: UsageParams['filters'], currentUser: CurrentUser ): Promise<UsageOutput['data']> {
        const getLLMUsageUseCase = container.resolve(GetLLMUsageUseCase)
        const { data } = await getLLMUsageUseCase.execute({ filters, currentUser })
        return data
    }

    static async listUserMcpServers (options: QueryOptions, currentUser: CurrentUser ): Promise<McpServerProps[] | null | undefined> {
        const listMcpServersByUserUseCase = container.resolve(ListMcpServersByUserUseCase)
        const { page, limit } = options || {}

        const { data } = await listMcpServersByUserUseCase.execute({ 
			options: { page, limit },
			currentUser,
		})

        return data
    }

    static async createMcpServer (payload: McpServerProps, currentUser: CurrentUser,): Promise<McpServerProps> {
        if (!currentUser) throw new Error('[AGENT] CurrentUser is required to create a new mcp server')

        const createMcpServerUseCase = container.resolve(CreateMcpServerUseCase)

        const { data } = await createMcpServerUseCase.execute({
            payload,
            currentUser,
        })

        if (!data) throw new Error('[AGENT] There was an error creating the mcp server')

        return data
    }

    constructor (agentOptions: AgentOptions) {
        if (!agentOptions?.loop) throw new Error('[AGENT] An AgentLoop instance is required')

        this._loop = agentOptions.loop
        this._tools = agentOptions.tools ?? []

        this.currentChat = Chat.withDefaults(this._loop.name)
    }

    get tools () {
        return this._tools
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

    async run (input: Input, currentUser: CurrentUser, currentSession?: CurrentSession) {
        try {
            const { chatId, message } = input || {}

            this.logger.debug(input, '[AGENT] Agent started')

            if (!this._loop?.nodes || !this._loop?.initialNode) throw new Error('[AGENT] Loop is missing')
            if (!message) throw new Error('[AGENT] Message is required')
            if (!currentUser) throw new Error('[AGENT] CurrentUser is required')

            this.stopLoop = false
            this.stopRequested = false
            this.pendingNextNode = undefined

            this.currentUser = currentUser
            this.currentSession = currentSession
            this.currentMessage = message
            this.answerId = (new (require('mongodb').ObjectId)()).toString()

            await this.preRunner(chatId)

            await this.runLoop()

            await this.postRunner()

            return { data: this.currentChat }
        } catch (error) {
            this.currentChat.state?.setStatus(AgentStatus.FAILED)
            this.currentChat.state?.setCurrentActivity('stopped')
            await this.saveChat()
            await this.disconnectMcpServers()
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

        this.currentChat.state?.setStatus(AgentStatus.PROCESSING)
        this.currentChat.state?.setCurrentActivity('Starting...')
        await this.saveChat({ resetStop: true })

        await this.loadMcpServers()


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

    private async loadMcpServers (): Promise<void> {
        if (!this.currentUser) return

        const servers = await Agent.listUserMcpServers({}, this.currentUser)

        for (const props of servers ?? []) {
            const mcpServer = McpServer.fromJSON(props)

            try {
                const mcpClient = await mcpServer.connect()
                const { tools: mcpTools } = await mcpClient.listTools()
                const tools = mcpTools.map(mcpTool => Tool.fromMcp(mcpTool, mcpClient, { namespace: mcpServer.name ?? 'mcp' }))

                this._tools.push(...tools)
                this._mcps.push(mcpServer)
            } catch (error) {
                this.logger.error({ error, mcpServer: mcpServer.name }, '[AGENT] Failed to connect MCP server')
            }
        }
    }

    private async disconnectMcpServers (): Promise<void> {
        for (const mcpServer of this._mcps) {
            await mcpServer.disconnect().catch(error => {
                this.logger.error({ error, mcpServer: mcpServer.name }, '[AGENT] Failed to disconnect MCP server')
            })
        }
        this._mcps = []
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

        while (!this.stopLoop && iterations < MAX_ITERATIONS) {
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

        const matchedTools = rankToolsByKeywords(keywords, this._tools)

        if (matchedTools.length <= 5 && !matchedTools.some(t => t.toolName === webSearchTool.name)) {
            matchedTools.push({ toolName: webSearchTool.name, score: 0.1, matchedKeywords: [], tool: webSearchTool })
        }

        if (matchedTools.length <= 5 && !matchedTools.some(t => t.toolName === callAiTool.name)) {
            matchedTools.push({ toolName: callAiTool.name, score: 0.1, matchedKeywords: [], tool: callAiTool })
        }

        const startIndex = (page - 1) * limit
        return matchedTools.slice(startIndex, startIndex + limit)
    }

    private buildRunContext (): RunContext {
        const sessionId = this.currentChat._id?.toString() ?? ''

        return {
            task: this.currentChat.activeTask,
            chat: this.currentChat,
            currentUser: this.currentUser!,
            currentSession: this.currentSession,
            currentMessage: this.currentMessage,
            answerId: this.answerId,
            tools: this._tools,
            searchTools: this.searchTools.bind(this),
            baseParams: {
                currentUser: this.currentUser!,
                sessionId,
                answerId: this.answerId,
            },
            skillParams: {
                sessionId,
                answerId: this.answerId,
                userMessage: this.currentMessage,
                currentUser: this.currentUser,
                currentSession: this.currentSession,
                chat: this.currentChat,
            },
            reply: (content) => this.currentChat.pushMessage({ _id: this.answerId, role: 'assistant', content }),
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
