import { ObjectId } from 'mongodb'
import { McpServer } from '../../src/services/mcp-servers/entities/mcpserver.entity'
import { buildManifest } from '../../src/services/mcp-servers/entities/mcp-manifest'
import type { McpServerProps } from '../../src/services/mcp-servers/entities/mcpserver.entity'

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
    instructions?: string
    trust?: 'locked' | 'approved' | 'blocked' | 'legacy'
    storedTools?: FakeMcpToolSpec[]
    approvedTools?: FakeMcpToolSpec[]
}

const DEFAULT_TOOLS: FakeMcpToolSpec[] = [
    { name: 'ping', description: 'ping', inputSchema: { type: 'object', properties: {} } },
]

const manifestOf = (tools: FakeMcpToolSpec[], instructions?: string) => buildManifest({ instructions, tools })

const clone = <T>(value: T): T => structuredClone(value)

class FakeMcpRegistry {
    records = new Map<string, McpServerProps>()
    live = new Map<string, { tools: FakeMcpToolSpec[]; failures: number; instructions?: string }>()
    listFails = false
    connectAttempts: Record<string, number> = {}
    calls: { server: string; tool: string; arguments: Record<string, any> }[] = []
    verifies: string[] = []
    decisions: { name: string; decision: string; manifestHash?: string }[] = []

    reset (): void {
        this.records.clear()
        this.live.clear()
        this.listFails = false
        this.connectAttempts = {}
        this.calls = []
        this.verifies = []
        this.decisions = []
    }

    set (servers: FakeMcpServerSpec[]): void {
        this.reset()

        for (const spec of servers) {
            const tools = spec.tools ?? DEFAULT_TOOLS
            const stored = manifestOf(spec.storedTools ?? tools, spec.instructions)
            const approved = spec.approvedTools ? manifestOf(spec.approvedTools, spec.instructions) : stored
            const trust = spec.trust ?? 'approved'

            this.live.set(spec.name, { tools, failures: spec.failures ?? 0, instructions: spec.instructions })
            this.records.set(spec.name, {
                _id: new ObjectId().toString(),
                name: spec.name,
                url: `http://fake/${spec.name}`,
                type: 'http',
                ...(trust === 'legacy' ? {} : {
                    trust,
                    status: 'ok' as const,
                    approvedHash: trust === 'approved' ? approved.hash : null,
                    history: trust === 'approved' && approved.hash !== stored.hash ? [stored, approved] : [stored],
                }),
            })
        }
    }

    changeLive (name: string, tools: FakeMcpToolSpec[]): void {
        this.live.get(name)!.tools = tools
    }

    record (name: string): McpServerProps {
        return this.records.get(name)!
    }

    private store (name: string, server: McpServer): void {
        const json = server.toJSON()
        this.records.set(name, clone({ ...json, _id: String(json._id) }))
    }

    private byId (id: string): McpServerProps {
        const found = [...this.records.values()].find(record => String(record._id) === id)
        if (!found) throw new Error('Mcp Server not found')
        return found
    }

    async list (_params?: unknown): Promise<{ data: McpServerProps[] }> {
        if (this.listFails) throw new Error('listing is down')
        return { data: [...this.records.values()].map(clone) }
    }

    async verify (params: { id: string }): Promise<{ data: McpServerProps }> {
        const record = this.byId(params.id)
        this.verifies.push(record.name!)

        const server = FakeMcpServer.fromJSON(clone(record))

        try {
            server.addManifest(await server.fetchManifest())
        } catch (error) {
            server.markError(error)
        }

        this.store(record.name!, server)

        return { data: clone(this.record(record.name!)) }
    }

    async decide (params: { id: string; decision: 'approve' | 'block'; manifestHash?: string }): Promise<{ data: McpServerProps }> {
        const record = this.byId(params.id)
        this.decisions.push({ name: record.name!, decision: params.decision, manifestHash: params.manifestHash })

        const server = FakeMcpServer.fromJSON(clone(record))

        if (params.decision === 'approve') server.approve(params.manifestHash!)
        else server.block()

        this.store(record.name!, server)

        return { data: clone(this.record(record.name!)) }
    }
}

export const fakeMcp = new FakeMcpRegistry()

export class FakeMcpServer extends McpServer {
    static fromJSON (props: McpServerProps): FakeMcpServer {
        const server = McpServer.fromJSON(props)
        Object.setPrototypeOf(server, FakeMcpServer.prototype)
        return server as FakeMcpServer
    }

    async connect (): Promise<any> {
        const name = this.name!
        const live = fakeMcp.live.get(name)!
        fakeMcp.connectAttempts[name] = (fakeMcp.connectAttempts[name] ?? 0) + 1

        if (live.failures > 0) {
            live.failures--
            throw new Error(`cannot connect to ${name}`)
        }

        const client = {
            listTools: async () => ({ tools: live.tools }),
            getServerVersion: () => ({ name, version: '1' }),
            getInstructions: () => live.instructions,
            close: async () => undefined,
            callTool: async ({ name: tool, arguments: args }: { name: string; arguments: Record<string, any> }) => {
                fakeMcp.calls.push({ server: name, tool, arguments: args })
                const spec = live.tools.find(candidate => candidate.name === tool)
                return spec?.result ? spec.result(args) : { content: [{ type: 'text', text: 'ok' }], structuredContent: { ok: true } }
            },
        }

        this.mcpClient = client as any

        return client
    }

    async disconnect (): Promise<void> {
        this.mcpClient = undefined
    }
}
