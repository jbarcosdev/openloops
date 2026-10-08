import { Logger } from '@common/logger'
import { BaseEntity } from '@common/base/base.entity'
import { Tool, BaseParams } from '@tools/tool'
import { AgentAction, truncateForPrompt } from '@services/tasks/entities/agent-action.entity'
import { AgentTask, RefSources, NATIVE_TOOL_NAMES, SEARCH_TOOLS } from '@services/tasks/entities/agent-task.entity'
import { Workspace } from './workspace'
import { needsSearch } from './tool-catalog'
import { NativeTools } from './native-tools'
import { WeightedKeyword, ScoredTool } from './utils/rank-tools-by-keywords'
import { describeShapeWithin } from './utils/describe-shape'

const DEFAULT_OFFLOAD_THRESHOLD_CHARS = 100000
const DEFAULT_STUB_THRESHOLD_CHARS = 4000
const TRANSIENT_PATTERN = /timeout|timed out|econn|enotfound|network|socket|\b50[234]\b|\b429\b|rate limit|temporar|unavailable|overloaded/i
const NOT_FOUND_PATTERN = /not found|does not exist|doesn't exist|no existe|no encontrad/i
const NOT_FOUND_NOTE = "Harness note: a name that fails once may only be written differently from how the system stores it. Before concluding that it does not exist, check it against the system's own listing or search, and treat any suggestion in the error as a hint to verify, not as the answer."
const VALIDATION_PATTERN = /unexpected keyword argument|unexpected argument|missing required argument|validation errors? for/i
const VALIDATION_NOTE = "Harness note: the arguments do not match the tool's schema. An unexpected argument is usually a misnamed version of a missing one: keep its value and use the name from the schema (HARNESS.schemas lists the arguments of the tools you have already seen)."
const AMBIGUOUS_PATTERN = /ambiguous|more than one (?:match|result|entity)|multiple (?:matches|results|entities)|\b\d+ \w+ match\b/i
const AMBIGUOUS_NOTE = "Harness note: the system matched more than one entity, and even an exact name can be ambiguous. Use the unique identifier of the candidate the user chose, from the error or from a listing, in the same argument that took the name. If the user already chose, do not ask again, and never repeat the call with the name."
const DEFAULT_MAX_STORED_CHARS = 2_000_000
const DEFAULT_PREVIEW_CHARS = 500

export interface ToolPipelineOptions {
    offloadThresholdChars?: number
    stubThresholdChars?: number
    maxStoredChars?: number
    previewChars?: number
}

export interface ToolPipelineRunOptions {
    blockDuplicates?: boolean
}

interface ToolPipelineDeps {
    workspace: Workspace
    tools: () => Tool[]
    searchTools: (keywords: WeightedKeyword[], opts?: { page?: number; limit?: number }) => ScoredTool[]
    baseParams: BaseParams
    logger: Logger
}

export class ToolPipeline {
    private readonly offloadThresholdChars: number
    private readonly stubThresholdChars: number
    private readonly maxStoredChars: number
    private readonly previewChars: number
    private readonly nativeTools: NativeTools

    constructor (private readonly deps: ToolPipelineDeps, options?: ToolPipelineOptions) {
        this.nativeTools = new NativeTools({ workspace: deps.workspace, searchTools: deps.searchTools })
        this.offloadThresholdChars = options?.offloadThresholdChars ?? DEFAULT_OFFLOAD_THRESHOLD_CHARS
        this.stubThresholdChars = options?.stubThresholdChars ?? DEFAULT_STUB_THRESHOLD_CHARS
        this.maxStoredChars = options?.maxStoredChars ?? DEFAULT_MAX_STORED_CHARS
        this.previewChars = options?.previewChars ?? DEFAULT_PREVIEW_CHARS
    }

    private notFoundMessage (name: string): string {
        const invokers = this.deps.tools().map(tool => tool.name as string).filter(toolName => toolName.endsWith('__invoke_tool'))
        const base = `Tool "${name}" is not in your tool list.`
        const suffix = `__${name.toLowerCase()}`
        const similar = this.deps.tools().map(tool => tool.name as string).filter(toolName => toolName.toLowerCase().endsWith(suffix))

        if (similar.length) return `${base} Tool names include the server prefix, written in full. Did you mean ${similar.map(toolName => `"${toolName}"`).join(' or ')}?`

        if (!invokers.length) return `${base} Use the exact tool names from your tool list.`

        const example = JSON.stringify({ tool: invokers[0], arguments: { name, arguments: {} } })

        return `${base} It is a hidden tool of a server, so it cannot be called directly. Run it through the server's invoke tool (${invokers.join(', ')}) like this: ${example}, filling "arguments" with the input schema returned by the server's search.`
    }

    private searchUnavailableMessage (): string {
        const searchers = this.deps.tools().map(tool => tool.name as string).filter(toolName => toolName.endsWith('__search_tools'))
        const base = `Tool "${SEARCH_TOOLS}" is not in your tool list: all the external tools you can use are already listed.`

        if (!searchers.length) return `${base} Use the exact tool names from your tool list.`

        return `${base} To find the hidden tools of a server, run that server's own search tool (${searchers.join(', ')}) following its description.`
    }

    requiresApproval (action: AgentAction): boolean {
        const tool = this.findTool(action.name)
        return Boolean(tool?.destructive) && !action.approved
    }

    async run (task: AgentTask, action: AgentAction, opts?: ToolPipelineRunOptions): Promise<AgentAction> {
        if (action.name === SEARCH_TOOLS && !needsSearch(this.deps.tools())) {
            action.markFailed({ message: this.searchUnavailableMessage(), retryable: false })
            return action
        }

        if (NATIVE_TOOL_NAMES.includes(action.name as string)) {
            action.answerId = BaseEntity.toObjectId(this.deps.baseParams.answerId)
            await this.nativeTools.run(task, action)
            return action
        }

        const tool = this.findTool(action.name)

        if (!tool) {
            action.markFailed({ message: this.notFoundMessage(String(action.name)), retryable: false })
            return action
        }

        if (tool.destructive && !action.approved) {
            action.markFailed({ message: `Tool "${tool.name}" is destructive and needs explicit user confirmation before it can run`, retryable: false })
            return action
        }

        const sources = await this.loadSources(task, action)
        const unresolved: string[] = []
        const args = task.resolveArgs(action, sources, unresolved)

        if (unresolved.length) {
            action.markFailed({ message: `Unresolved references in arguments: ${unresolved.join(', ')}. The referenced step output or path does not exist.`, retryable: false })
            return action
        }

        const failedBefore = task.findExecuted(action.name, args, { status: 'failed', exclude: action })

        if (failedBefore && !TRANSIENT_PATTERN.test(failedBefore.error?.message ?? '')) {
            const previous = String(failedBefore.error?.message ?? '').slice(0, 500)
            action.markFailed({ message: `An identical call to "${action.name}" already failed (ref ${failedBefore.stepId ?? failedBefore.id}) with: ${previous}\n\nRepeating it will not change the result. Change the arguments or the approach.`, retryable: false })
            return action
        }

        if (opts?.blockDuplicates !== false) {
            const duplicate = task.findExecuted(action.name, args, { status: 'completed', exclude: action })

            if (duplicate) {
                action.markFailed({ message: `An identical call to "${action.name}" already completed (ref ${duplicate.stepId ?? duplicate.id}). Reuse its output instead of repeating it.`, retryable: false })
                return action
            }
        }

        action.answerId = BaseEntity.toObjectId(this.deps.baseParams.answerId)

        await action.runTool(tool, args, this.deps.baseParams)

        if (action.status === 'failed' && action.error) {
            const message = action.error.message ?? ''
            const notes = [
                ...(NOT_FOUND_PATTERN.test(message) ? [NOT_FOUND_NOTE] : []),
                ...(VALIDATION_PATTERN.test(message) ? [VALIDATION_NOTE] : []),
                ...(AMBIGUOUS_PATTERN.test(message) ? [AMBIGUOUS_NOTE] : []),
            ]

            if (notes.length) action.error = { ...action.error, message: `${message}\n\n${notes.join('\n\n')}` }
        }

        if (action.status === 'completed') {
            task.learnSchemas(action.structuredOutput)
            await this.offload(task, action)
        }

        return action
    }

    private findTool (name?: string): Tool | undefined {
        return this.deps.tools().find(tool => tool.name === name)
    }

    private async loadSources (task: AgentTask, action: AgentAction): Promise<RefSources> {
        const { contexts } = AgentTask.collectRefs(action.args)
        const outputs = new Map<string, any>()
        const notes = new Map<string, any>()

        const offloaded = task.referencedActions(action.args).filter(a => a.outputRef)

        await Promise.all([
            ...offloaded.map(async referenced => {
                const item = await this.deps.workspace.get(referenced.outputRef!, { taskId: task.id })
                if (item && !item.truncated) outputs.set(referenced.id, item.content)
            }),
            ...Array.from(new Set(contexts)).map(async name => {
                const item = await this.deps.workspace.get(name, { taskId: task.id })
                if (item) notes.set(name, item.content)
            }),
        ])

        return {
            stepOutput: referenced => outputs.get(referenced.id),
            context: name => notes.get(name),
        }
    }

    private async offload (task: AgentTask, action: AgentAction): Promise<void> {
        const output = action.structuredOutput
        const text = typeof output === 'string' ? output : JSON.stringify(output)

        if (!text || text.length <= this.stubThresholdChars) return

        const name = `out_${String(action.stepId ?? action.id).replace(/[^\w-]/g, '_')}`
        const oversized = text.length > this.maxStoredChars

        try {
            await this.deps.workspace.save({
                name,
                kind: 'tool_output',
                taskId: task.id,
                source: action.name,
                description: `Output of ${action.name}`,
                content: oversized ? text.slice(0, this.maxStoredChars) : output,
                truncated: oversized,
            })

            const offloaded = {
                ref: name,
                totalChars: text.length,
                outline: oversized ? undefined : describeShapeWithin(output),
                preview: text.slice(0, this.previewChars),
            }

            if (text.length > this.offloadThresholdChars) action.offloadOutput(offloaded)
            else action.keepOutputWithStub(offloaded)
        } catch (error: any) {
            this.deps.logger.error({ error: error?.message ?? error, action: action.name }, '[TOOL PIPELINE] Failed to offload output, keeping a truncated copy')
            if (text.length > this.offloadThresholdChars) action.output = truncateForPrompt(output, this.offloadThresholdChars)
        }
    }
}
