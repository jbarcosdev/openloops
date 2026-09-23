import { CurrentUser } from '@services/app/core'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js'

interface InputSchema {
    type: 'object'
    properties: Record<string, { type: string; description: string; fallback?: string; enum?: string[] }>
    required: string[]
}

interface Output {
    data: any
}

export interface BaseParams {
    currentUser: CurrentUser
    sessionId: string
    answerId: string
}

export class Tool {
    readonly name: string
    readonly description: string
    readonly destructive: boolean
    readonly parameters: InputSchema
    private readonly handler: (...args: any[]) => Promise<Output>

    constructor (props: {
        name: string,
        description: string,
        destructive?: boolean,
        parameters: InputSchema,
        handler: (...args: any[]) => Promise<Output>,
    }) {
        this.name = props.name
        this.description = props.description
        this.destructive = props.destructive ?? false
        this.parameters = props.parameters
        this.handler = props.handler
    }

    async run (...args: any[]) {
        return this.handler(...args)
    }

    static fromMcp (mcpTool: McpTool, mcpClient: Client, opts: { namespace: string }): Tool {
        return new Tool({
            name: `${opts.namespace}__${mcpTool.name}`,
            description: mcpTool.description ?? '',
            destructive: mcpTool.annotations?.destructiveHint ?? false,
            parameters: mcpTool.inputSchema as unknown as InputSchema,
            handler: async (params: any = {}) => {
                const { currentUser, sessionId, answerId, ...args } = params
                const result = await mcpClient.callTool({ name: mcpTool.name, arguments: args })
                return { data: result }
            },
        })
    }
}
