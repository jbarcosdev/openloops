import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

type McpType = 'http'

export interface McpServerProps extends BaseEntityProps {
    name?: string
    url?: string
    type?: McpType
    headers?: Record<string, string>
}

export class McpServer extends BaseEntity {
    mcpClient?: Client

    static fromJSON (props: McpServerProps) {
        return new McpServer(
            props,
            props.name || undefined,
            props.url || undefined,
            props.type || undefined,
            props.headers || undefined,
        )
    }

    constructor (
        private readonly props: McpServerProps,
        public name?: string,
        public url?: string,
        public type?: McpType,
        public headers?: Record<string, string>,
    ) {
        super(props)
    }

    toJSON (): McpServerProps {
        return {
            ...super.toJSON(),
            name: this.name,
            url: this.url,
            type: this.type,
            headers: this.headers,
        }
    }

    async connect (): Promise<Client> {
        if (!this.url) throw new Error(`[McpServer] "${this.name}" is missing a url`)
        if (this.type !== 'http') throw new Error(`[McpServer] "${this.name}" has an unsupported type "${this.type}" — only "http" is allowed`)

        const transport = new StreamableHTTPClientTransport(new URL(this.url), {
            requestInit: { headers: this.headers ?? {} },
        })

        const client = new Client({ name: `open-loops-${this.name ?? 'mcp'}`, version: '1.0.0' })
        await client.connect(transport)

        this.mcpClient = client
        return client
    }

    async disconnect (): Promise<void> {
        await this.mcpClient?.close()
        this.mcpClient = undefined
    }
}
