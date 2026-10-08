import { LLMToolDefinition } from '@clients/llm-types'
import { AgentTask, readPath } from '@services/tasks/entities/agent-task.entity'
import { AgentAction } from '@services/tasks/entities/agent-action.entity'
import { WeightedKeyword, ScoredTool } from './utils/rank-tools-by-keywords'
import { Workspace } from './workspace'
import { describeTool } from './tool-catalog'

const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 8
const SEARCH_DESCRIPTION_CHARS = 300
const SEARCH_OUTPUT_CHARS = 5500
const DEFAULT_READ_CHARS = 4000
const MAX_READ_CHARS = 5000
const MAX_FIND_MATCHES = 20
const FIND_RECORD_CHARS = 600
const FIND_MAX_NODES = 200000
const FIND_MAX_DEPTH = 12

function squash (text: string): string {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function findRecords (root: any, query: string): { path: string; record: any }[] {
    const wanted = squash(query)
    const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    if (!wanted) return []

    const search = (matches: (text: string) => boolean) => {
        const found: { path: string; record: any }[] = []
        const seen = new Set<any>()
        let nodes = 0

        const walk = (value: any, path: string, parent: any, depth: number) => {
            if (nodes++ > FIND_MAX_NODES || depth > FIND_MAX_DEPTH) return

            if (typeof value === 'string') {
                const record = parent !== null && typeof parent === 'object' && !Array.isArray(parent) ? parent : value
                if (matches(value) && !seen.has(record)) {
                    seen.add(record)
                    found.push({ path, record })
                }
                return
            }

            if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, value, depth + 1))
            else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, item]) => walk(item, path ? `${path}.${key}` : key, value, depth + 1))
        }

        walk(root, '', null, 0)

        return found
    }

    const exact = search(text => squash(text).includes(wanted))

    return exact.length || words.length < 2 ? exact : search(text => words.every(word => squash(text).includes(squash(word))))
}

export const NATIVE_TOOLS: LLMToolDefinition[] = [
    {
        name: 'search_tools',
        description: 'Find external tools by capability. Pass a few keywords, written in the language of the tool descriptions in CONTEXT.tool_sources, each with a weight from 0.1 (marginal) to 1.0 (essential). Returns the matching tools; from your next turn they are in your tool list and you run them by naming them in an action.',
        parameters: {
            type: 'object',
            properties: {
                keywords: {
                    type: 'array',
                    description: 'Keywords describing the capability, in the language of the tool descriptions, for example calendar, events, list',
                    items: {
                        type: 'object',
                        properties: {
                            keyword: { type: 'string', description: 'A single word, or a short fixed expression' },
                            weight: { type: 'number', description: 'Importance from 0.1 to 1.0' },
                        },
                        required: ['keyword', 'weight'],
                    },
                },
                page: { type: 'integer', description: 'Result page, starting at 1' },
                limit: { type: 'integer', description: `Tools per page (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT})` },
            },
            required: ['keywords'],
        },
    },
    {
        name: 'read_context',
        description: 'Read a workspace item: a note saved with save_context, or a large tool output (use the "workspace_ref" name from its result as "name"). Supports a path into structured content, paging for long text, and "find" to locate entries inside a large result by text.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the workspace item' },
                path: { type: 'string', description: 'Optional path into structured content, like results[0].id' },
                find: { type: 'string', description: 'Text to look for inside the item (or inside "path"). Case, spaces, hyphens and underscores are ignored. Returns only the matching entries with their path, so you do not have to read a long list' },
                offset: { type: 'integer', description: 'Character offset to start reading from (default 0)' },
                max_chars: { type: 'integer', description: `Maximum characters to return (default ${DEFAULT_READ_CHARS}, max ${MAX_READ_CHARS})` },
            },
            required: ['name'],
        },
    },
    {
        name: 'save_context',
        description: 'Save a note in the task workspace to reuse it later, either with read_context or by referencing "{{context.<name>}}" in tool arguments. Use it for facts, decisions or intermediate results worth keeping.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Short unique name using letters, numbers, underscore or dash' },
                content: { type: 'string', description: 'The text or JSON to store' },
                description: { type: 'string', description: 'One line explaining what the note contains' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'ask_user',
        description: 'Pause the task and ask the user a question. Use it only when you cannot continue without information that only the user can provide. Their answer comes back as the result of this action.',
        parameters: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'The question to show to the user, in the user\'s language' },
            },
            required: ['question'],
        },
    },
    {
        name: 'respond',
        description: 'Deliver your final answer to the user and end the task. Use it once, when you have what you need or when you cannot do more. Do not combine it with actions whose results you still need.',
        parameters: {
            type: 'object',
            properties: {
                answer: { type: 'string', description: 'The final answer for the user, in the user\'s language' },
            },
            required: ['answer'],
        },
    },
]

interface NativeToolsDeps {
    workspace: Workspace
    searchTools: (keywords: WeightedKeyword[], opts?: { page?: number; limit?: number }) => ScoredTool[]
}

export class NativeTools {
    constructor (private readonly deps: NativeToolsDeps) {}

    async run (task: AgentTask, action: AgentAction): Promise<void> {
        const definition = NATIVE_TOOLS.find(tool => tool.name === action.name)
        const args = action.args ?? {}

        const missing = (definition?.parameters.required ?? []).filter((key: string) => args[key] === undefined || args[key] === null)
        if (missing.length) {
            action.markFailed({ message: `Invalid arguments: ${missing.map((key: string) => `Missing required argument "${key}"`).join('; ')}`, retryable: false })
            return
        }

        action.markRunning()

        try {
            action.markCompleted(await this.execute(task, action.name!, args))
        } catch (error: any) {
            action.markFailed({ message: error?.message ?? String(error), retryable: false })
        }
    }

    private async execute (task: AgentTask, name: string, args: Record<string, any>): Promise<any> {
        switch (name) {
            case 'search_tools': return this.searchTools(args)
            case 'read_context': return this.readContext(task, args)
            case 'save_context': return this.saveContext(task, args)
            default: throw new Error(`"${name}" is interpreted by the runtime and cannot be executed`)
        }
    }

    private searchTools (args: Record<string, any>) {
        const keywords: WeightedKeyword[] = (Array.isArray(args.keywords) ? args.keywords : []).map((item: any) => (
            typeof item === 'string'
                ? { keyword: item, weight: 1 }
                : { keyword: String(item?.keyword ?? ''), weight: Number(item?.weight) || 1 }
        ))

        const limit = Math.min(Math.max(Number(args.limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT)
        const page = Math.max(Number(args.page) || 1, 1)

        const tools: any[] = []
        let size = 0

        for (const { tool } of this.deps.searchTools(keywords, { page, limit })) {
            const { parameters, ...entry } = describeTool(tool, SEARCH_DESCRIPTION_CHARS)

            size += JSON.stringify(entry).length
            if (tools.length && size > SEARCH_OUTPUT_CHARS) break

            tools.push(entry)
        }

        return tools.length ? { page, tools, note: 'These tools are now in your tool list: run them by naming them in an action.' } : { page, tools, hint: 'No tool matched. Retry with synonyms written in the language of the tool descriptions shown in CONTEXT.tool_sources.' }
    }

    private async readContext (task: AgentTask, args: Record<string, any>) {
        const item = await this.deps.workspace.get(String(args.name), { taskId: task.id })
        if (!item) return { found: false }

        const path = args.path ? String(args.path).replace(/^(?=[\w-])/, '.') : undefined
        const value = readPath(item.content, path)
        if (value === undefined) return { found: true, name: item.name, path_found: false }

        if (typeof args.find === 'string' && args.find.trim()) {
            const found = findRecords(value, args.find)

            return {
                name: item.name,
                find: args.find,
                total_matches: found.length,
                matches: found.slice(0, MAX_FIND_MATCHES).map(({ path: matchPath, record }) => {
                    const text = typeof record === 'string' ? record : JSON.stringify(record)
                    return { path: matchPath, record: text.length > FIND_RECORD_CHARS ? text.slice(0, FIND_RECORD_CHARS) : record }
                }),
                ...(found.length > MAX_FIND_MATCHES ? { note: `Showing the first ${MAX_FIND_MATCHES} matches: use a more specific text.` } : {}),
                ...(found.length ? {} : { hint: 'No entry contains this text. Try a shorter or different part of it, or read the item with a path.' }),
                ...(item.truncated ? { stored_truncated: true } : {}),
            }
        }

        const text = typeof value === 'string' ? value : JSON.stringify(value)
        const offset = Math.max(Number(args.offset) || 0, 0)
        const max = Math.min(Math.max(Number(args.max_chars) || DEFAULT_READ_CHARS, 1), MAX_READ_CHARS)

        return {
            name: item.name,
            total_chars: text.length,
            offset,
            has_more: offset + max < text.length,
            ...(item.truncated ? { stored_truncated: true } : {}),
            content: text.slice(offset, offset + max),
        }
    }

    private async saveContext (task: AgentTask, args: Record<string, any>) {
        const name = String(args.name).trim().replace(/[^\w-]/g, '_')
        if (!name) throw new Error('A valid name is required')

        let content: any = args.content
        if (typeof content === 'string') {
            try { content = JSON.parse(content) } catch { content = args.content }
        }

        await this.deps.workspace.save({
            name,
            kind: 'note',
            taskId: task.id,
            content,
            description: args.description,
            source: 'save_context',
        })

        return { saved: name }
    }
}
