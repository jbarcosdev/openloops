export interface FakeMcpToolSpec {
    name: string
    description?: string
    inputSchema?: Record<string, any>
    annotations?: Record<string, any>
    result?: (args: Record<string, any>) => any
}

export interface FakeMcpServerSpec {
    name: string
    failures?: number
    tools?: FakeMcpToolSpec[]
}

const DEFAULT_TOOLS: FakeMcpToolSpec[] = [
    { name: 'ping', description: 'ping', inputSchema: { type: 'object', properties: {} } },
]

class FakeMcpRegistry {
    servers: FakeMcpServerSpec[] = []
    listFails = false
    connectAttempts: Record<string, number> = {}
    calls: { server: string; tool: string; arguments: Record<string, any> }[] = []

    reset (): void {
        this.servers = []
        this.listFails = false
        this.connectAttempts = {}
        this.calls = []
    }

    set (servers: FakeMcpServerSpec[]): void {
        this.servers = servers
    }

    async list (_params?: unknown): Promise<{ data: FakeMcpServerSpec[] }> {
        if (this.listFails) throw new Error('listing is down')
        return { data: this.servers }
    }
}

export const fakeMcp = new FakeMcpRegistry()

export class FakeMcpServer {
    name?: string
    private spec: FakeMcpServerSpec = { name: '' }
    private remainingFailures = 0

    static fromJSON (props: FakeMcpServerSpec): FakeMcpServer {
        const server = new FakeMcpServer()
        server.spec = props
        server.name = props.name
        server.remainingFailures = props.failures ?? 0
        return server
    }

    async connect (): Promise<any> {
        const name = this.spec.name
        fakeMcp.connectAttempts[name] = (fakeMcp.connectAttempts[name] ?? 0) + 1

        if (this.remainingFailures > 0) {
            this.remainingFailures--
            throw new Error(`cannot connect to ${name}`)
        }

        const tools = this.spec.tools ?? DEFAULT_TOOLS

        return {
            listTools: async () => ({ tools }),
            callTool: async ({ name: tool, arguments: args }: { name: string; arguments: Record<string, any> }) => {
                fakeMcp.calls.push({ server: name, tool, arguments: args })
                const spec = tools.find(candidate => candidate.name === tool)
                return spec?.result ? spec.result(args) : { content: [{ type: 'text', text: 'ok' }], structuredContent: { ok: true } }
            },
        }
    }

    async disconnect (): Promise<void> {}
}
