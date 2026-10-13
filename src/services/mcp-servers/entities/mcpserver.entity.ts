import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpManifest, McpManifestDiff, McpStatus, McpTrust, buildManifest, diffManifests } from './mcp-manifest'

export * from './mcp-manifest'

type McpType = 'http'

export type McpListedTool = Awaited<ReturnType<Client['listTools']>>['tools'][number]

const MAX_HISTORY = 5
const MAX_ERROR_CHARS = 300

export interface McpServerProps extends BaseEntityProps {
    name?: string
    url?: string
    type?: McpType
    headers?: Record<string, string>
    trust?: McpTrust
    approvedHash?: string | null
    history?: McpManifest[]
    status?: McpStatus
    lastError?: string | null
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
            props.trust || undefined,
            props.approvedHash,
            props.history,
            props.status || undefined,
            props.lastError,
        )
    }

    constructor (
        private readonly props: McpServerProps,
        public name?: string,
        public url?: string,
        public type?: McpType,
        public headers?: Record<string, string>,
        public trust?: McpTrust,
        public approvedHash?: string | null,
        public history?: McpManifest[],
        public status?: McpStatus,
        public lastError?: string | null,
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
            trust: this.trust,
            approvedHash: this.approvedHash,
            history: this.history,
            status: this.status,
            lastError: this.lastError,
        }
    }

    get latest (): McpManifest | undefined {
        return this.history?.[0]
    }

    get approved (): McpManifest | undefined {
        return this.approvedHash ? this.history?.find(manifest => manifest.hash === this.approvedHash) : undefined
    }

    diffAgainst (manifest: McpManifest): McpManifestDiff {
        return diffManifests(this.approved, manifest)
    }

    initialize (): this {
        this.trust = 'locked'
        this.approvedHash = null
        this.history = []
        this.status = 'unknown'
        this.lastError = null
        return this
    }

    lockForNewEndpoint (): this {
        this.trust = 'locked'
        this.approvedHash = null
        this.status = 'unknown'
        this.lastError = null
        return this
    }

    approve (hash: string): this {
        if (this.latest?.hash !== hash) throw new Error('The Mcp Server manifest changed since it was reviewed, review it again')
        this.trust = 'approved'
        this.approvedHash = hash
        return this
    }

    block (): this {
        this.trust = 'blocked'
        return this
    }

    addManifest (manifest: McpManifest): this {
        const history = this.history ?? []
        if (history[0]?.hash !== manifest.hash) {
            const kept = [manifest, ...history.filter(item => item.hash !== manifest.hash)].slice(0, MAX_HISTORY)
            const approved = this.approved
            if (approved && !kept.some(item => item.hash === approved.hash)) kept[kept.length - 1] = approved
            this.history = kept
        }
        this.status = 'ok'
        this.lastError = null
        return this
    }

    markError (error: unknown): this {
        let message = error instanceof Error ? error.message : String(error)
        for (const value of Object.values(this.headers ?? {})) if (value) message = message.split(value).join('***')
        if (this.url) message = message.split(this.url).join('[url]')
        this.status = 'error'
        this.lastError = message.slice(0, MAX_ERROR_CHARS)
        return this
    }

    async inspect (client: Client): Promise<{ manifest: McpManifest, tools: McpListedTool[] }> {
        const tools: McpListedTool[] = []
        let cursor: string | undefined
        do {
            const page = await client.listTools(cursor ? { cursor } : undefined)
            tools.push(...page.tools)
            cursor = page.nextCursor
        } while (cursor)
        return { manifest: buildManifest({ instructions: client.getInstructions(), tools }), tools }
    }

    async fetchManifest (timeoutMs = 10000): Promise<McpManifest> {
        let timer: NodeJS.Timeout | undefined
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Connection timed out')), timeoutMs)
        })
        try {
            return await Promise.race([this.connect().then(client => this.inspect(client)).then(({ manifest }) => manifest), timeout])
        } finally {
            clearTimeout(timer)
            await this.disconnect().catch(() => undefined)
        }
    }

    async connect (): Promise<Client> {
        if (!this.url) throw new Error(`[McpServer] "${this.name}" is missing a url`)
        if (this.type !== 'http') throw new Error(`[McpServer] "${this.name}" has an unsupported type "${this.type}", only "http" is allowed`)

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
