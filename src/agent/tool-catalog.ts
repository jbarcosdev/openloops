import { Tool } from '@tools/tool'
import { LLMToolDefinition } from '@clients/llm-types'
import { SEARCH_TOOLS } from '@services/tasks/entities/agent-task.entity'

const FULL_CATALOG_LIMIT = 15
const SAMPLES_PER_SOURCE = 3
const SAMPLE_DESCRIPTION_CHARS = 120
const TOOL_DESCRIPTION_CHARS = 400
const DECLARED_DESCRIPTION_CHARS = 4000
const LOCAL_SOURCE = 'local'
const FUNCTION_NAME = /^[a-zA-Z0-9_-]{1,64}$/

export interface ToolCatalog {
    tools: LLMToolDefinition[]
    context: Record<string, any>
}

export interface ToolDescription {
    name: string
    description: string
    requires_confirmation: boolean
    parameters: Record<string, any>
}

export function isDeclarable (tool: Tool): boolean {
    return FUNCTION_NAME.test(tool.name)
}

export function describeTool (tool: Tool, chars = TOOL_DESCRIPTION_CHARS): ToolDescription {
    return {
        name: tool.name,
        description: tool.description.slice(0, chars),
        requires_confirmation: tool.destructive,
        parameters: tool.parameters,
    }
}

function declare (tool: Tool): LLMToolDefinition {
    return { name: tool.name, description: tool.description.slice(0, DECLARED_DESCRIPTION_CHARS), parameters: tool.parameters }
}

export function buildToolCatalog (allTools: Tool[], nativeTools: LLMToolDefinition[], discovered: string[]): ToolCatalog {
    const tools = allTools.filter(isDeclarable)

    if (tools.length <= FULL_CATALOG_LIMIT) {
        return {
            tools: [...nativeTools.filter(tool => tool.name !== SEARCH_TOOLS), ...tools.map(declare)],
            context: {},
        }
    }

    const sources = new Map<string, Tool[]>()

    for (const tool of tools) {
        const separator = tool.name.indexOf('__')
        const source = separator > 0 ? tool.name.slice(0, separator) : LOCAL_SOURCE
        sources.set(source, [...(sources.get(source) ?? []), tool])
    }

    const found = discovered.map(name => tools.find(tool => tool.name === name)).filter((tool): tool is Tool => !!tool)

    return {
        tools: [...nativeTools, ...found.map(declare)],
        context: {
            total_tools: tools.length,
            tool_sources: [...sources.entries()].map(([name, items]) => ({
                name,
                tool_count: items.length,
                sample: items.slice(0, SAMPLES_PER_SOURCE).map(tool => ({ name: tool.name, description: tool.description.slice(0, SAMPLE_DESCRIPTION_CHARS) })),
            })),
        },
    }
}
