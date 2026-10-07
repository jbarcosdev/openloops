import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js'
import { CurrentUser } from '@common/base'

interface InputSchema {
    type: 'object'
    properties: Record<string, { type: string; description: string; fallback?: string; enum?: string[]; anyOf?: Array<{ type?: string }>; [key: string]: any }>
    required: string[]
    additionalProperties?: boolean
}

interface Output {
    data: any
}

export interface BaseParams {
    currentUser: CurrentUser
    sessionId: string
    answerId: string
}

function schemaTypes (node: any): string[] {
    if (!node) return []
    if (node.type) return Array.isArray(node.type) ? node.type : [node.type]
    if (Array.isArray(node.anyOf)) {
        const nested: string[][] = node.anyOf.map(schemaTypes)
        return nested.some(types => !types.length) ? [] : nested.reduce((all, types) => all.concat(types), [])
    }
    return []
}

function matchesType (type: string, value: any): boolean {
    switch (type) {
        case 'string': return typeof value === 'string'
        case 'integer': return Number.isInteger(value)
        case 'number': return typeof value === 'number' && !Number.isNaN(value)
        case 'boolean': return typeof value === 'boolean'
        case 'array': return Array.isArray(value)
        case 'object': return typeof value === 'object' && !Array.isArray(value)
        case 'null': return value === null
        default: return true
    }
}

export class Tool {
    readonly name: string
    readonly description: string
    readonly annotations?: string
    readonly destructive: boolean
    readonly parameters: InputSchema
    private readonly handler: (...args: any[]) => Promise<Output>

    constructor (props: {
        name: string,
        description: string,
        annotations?: string,
        destructive?: boolean,
        parameters: InputSchema,
        handler: (...args: any[]) => Promise<Output>,
    }) {
        this.name = props.name
        this.description = props.description
        this.annotations = props.annotations
        this.destructive = props.destructive ?? false
        this.parameters = props.parameters
        this.handler = props.handler
    }

    get meta () {
        return {
            name: this.name,
            description: this.description,
            annotations: this.annotations,
        }
    }

    validate (args: Record<string, any> = {}): string[] {
        const errors: string[] = []
        const schema: any = this.parameters
        const properties: Record<string, any> = schema?.properties ?? {}

        for (const key of schema?.required ?? []) {
            if (args[key] === undefined || args[key] === null) errors.push(`Missing required argument "${key}"`)
        }

        for (const [key, value] of Object.entries(args)) {
            const property = properties[key]

            if (!property) {
                if (schema?.additionalProperties === false) errors.push(`Unknown argument "${key}"`)
                continue
            }

            if (value === undefined || value === null) continue

            const types = schemaTypes(property)
            if (types.length && !types.some(type => matchesType(type, value))) errors.push(`Argument "${key}" must be of type ${types.join(' or ')}`)
            if (Array.isArray(property.enum) && !property.enum.includes(value)) errors.push(`Argument "${key}" must be one of: ${property.enum.join(', ')}`)
        }

        return errors
    }

    async run (...args: any[]) {
        return this.handler(...args)
    }

    static fromMcp (mcpTool: McpTool, mcpClient: Client, opts: { namespace: string }): Tool {
        return new Tool({
            name: `${opts.namespace}__${mcpTool.name}`,
            description: mcpTool.description ?? '',
            annotations: mcpTool.annotations ? JSON.stringify(mcpTool.annotations) : undefined,
            destructive: mcpTool.annotations?.destructiveHint ?? false,
            parameters: mcpTool.inputSchema as unknown as InputSchema,
            handler: async (params: any = {}) => {
                const { currentUser, sessionId, answerId, ...args } = params
                const result: any = await mcpClient.callTool({ name: mcpTool.name, arguments: args })

                if (result?.isError) {
                    const text = (result.content ?? []).filter((item: any) => item?.type === 'text').map((item: any) => item.text).join('\n')
                    const error: any = new Error(text || `Tool "${mcpTool.name}" reported an error`)
                    error.retryable = false
                    throw error
                }

                return { data: result }
            },
        })
    }
}
