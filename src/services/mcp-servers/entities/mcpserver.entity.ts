import { BaseEntity, BaseEntityProps } from '@common/base/base.entity'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpChange, McpHistoryEntry, McpManifest, McpSource, McpStatus, McpTrust, buildManifest, diffManifests } from './mcp-manifest'

export * from './mcp-manifest'

type McpType = 'http'

const MAX_HISTORY = 20
const MAX_ERROR_CHARS = 300
const SYSTEM_FIELDS = ['status', 'lastCheckedAt', 'lastError', 'manifest', 'history'] as const

const hostOf = (url?: string): string | undefined => {
    try {
        return url ? new URL(url).origin : undefined
    } catch {
        return undefined
    }
}

export interface McpServerProps extends BaseEntityProps {
    name?: string
    url?: string
    type?: McpType
    headers?: Record<string, string>
    trust?: McpTrust
    status?: McpStatus
    lastCheckedAt?: Date | null
    lastError?: string | null
    manifest?: McpManifest | null
    approvedManifest?: McpManifest | null
    history?: McpHistoryEntry[]
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
            props.status || undefined,
            props.lastCheckedAt,
            props.lastError,
            props.manifest,
            props.approvedManifest,
            props.history,
        )
    }

    static stripSystemFields (props: McpServerProps): McpServerProps {
        const clean = { ...props }
        for (const field of SYSTEM_FIELDS) delete clean[field]
        return clean
    }

    constructor (
        private readonly props: McpServerProps,
        public name?: string,
        public url?: string,
        public type?: McpType,
        public headers?: Record<string, string>,
        public trust?: McpTrust,
        public status?: McpStatus,
        public lastCheckedAt?: Date | null,
        public lastError?: string | null,
        public manifest?: McpManifest | null,
        public approvedManifest?: McpManifest | null,
        public history?: McpHistoryEntry[],
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
            status: this.status,
            lastCheckedAt: this.lastCheckedAt,
            lastError: this.lastError,
            manifest: this.manifest,
            approvedManifest: this.approvedManifest,
            history: this.history,
        }
    }

    initialize (): this {
        this.trust = 'locked'
        this.status = 'unknown'
        this.lastCheckedAt = null
        this.lastError = null
        this.manifest = null
        this.approvedManifest = null
        this.history = []
        return this
    }

    lockForNewEndpoint (previousUrl?: string, source: McpSource = 'system'): this {
        this.trust = 'locked'
        this.status = 'unknown'
        this.lastCheckedAt = null
        this.lastError = null
        this.approvedManifest = null
        this.pushEvent({ type: 'endpoint_changed', at: new Date(), source, fromHash: this.manifest?.hash, fromHost: hostOf(previousUrl), toHost: hostOf(this.url) })
        return this
    }

    isUsable (): boolean {
        return this.trust === 'approved' && !!this.manifest && this.manifest.hash === this.approvedManifest?.hash
    }

    approve (source: McpSource = 'system'): this {
        if (!this.manifest) throw new Error(`[McpServer] "${this.name}" has no manifest to approve`)
        this.trust = 'approved'
        this.approvedManifest = this.manifest
        this.pushEvent({ type: 'approved', at: new Date(), source, toHash: this.manifest.hash })
        return this
    }

    block (source: McpSource = 'system'): this {
        this.trust = 'blocked'
        this.pushEvent({ type: 'blocked', at: new Date(), source, toHash: this.manifest?.hash })
        return this
    }

    pendingChanges (): McpChange[] {
        if (!this.manifest) return []
        return diffManifests(this.approvedManifest, this.manifest)
    }

    applyManifest (manifest: McpManifest): this {
        const previous = this.manifest
        this.status = 'ok'
        this.lastError = null
        this.lastCheckedAt = new Date()
        if (previous && previous.hash !== manifest.hash) {
            this.pushEvent({ type: 'manifest_changed', at: new Date(), source: 'system', fromHash: previous.hash, toHash: manifest.hash, changes: diffManifests(previous, manifest) })
        }
        this.manifest = manifest
        if (this.trust === 'approved' && this.approvedManifest?.hash !== manifest.hash) this.trust = 'pending'
        if (this.trust === 'pending' && this.approvedManifest?.hash === manifest.hash) this.trust = 'approved'
        return this
    }

    markError (error: unknown): this {
        this.status = 'error'
        this.lastCheckedAt = new Date()
        this.lastError = this.sanitizeError(error)
        return this
    }

    async fetchManifest (timeoutMs = 10000): Promise<McpManifest> {
        const run = async () => {
            const client = await this.connect()
            const tools: Array<{ name: string, description?: string, inputSchema?: unknown, annotations?: unknown }> = []
            let cursor: string | undefined
            do {
                const page = await client.listTools(cursor ? { cursor } : undefined)
                tools.push(...page.tools)
                cursor = page.nextCursor
            } while (cursor)
            const info = client.getServerVersion()
            return buildManifest({ serverName: info?.name, serverVersion: info?.version, instructions: client.getInstructions(), tools })
        }
        let timer: NodeJS.Timeout | undefined
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Connection timed out')), timeoutMs)
        })
        try {
            return await Promise.race([run(), timeout])
        } finally {
            clearTimeout(timer)
            await this.disconnect().catch(() => undefined)
        }
    }

    private pushEvent (entry: McpHistoryEntry): void {
        this.history = [entry, ...(this.history ?? [])].slice(0, MAX_HISTORY)
    }

    private sanitizeError (error: unknown): string {
        let message = error instanceof Error ? error.message : String(error)
        for (const value of Object.values(this.headers ?? {})) if (value) message = message.split(value).join('***')
        if (this.url) message = message.split(this.url).join('[url]')
        return message.slice(0, MAX_ERROR_CHARS)
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
