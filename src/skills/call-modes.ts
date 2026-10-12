import { extractJSON } from '@common/helpers'
import type { LLMMessage, LLMResponse, LLMToolCall, LLMToolChoice, LLMToolDefinition } from '@clients/llm-types'

/**
 * How a skill that works with a tool catalog talks to the model. The mode only changes the transport: the
 * conversation, the stored history and the object the skill returns are the same in every mode.
 *
 * - `plain_chat` (DEFAULT, recommended): ordinary chat completion. The tool catalog is sent as text in a system
 *   message (`{"tool_list": [...]}`), refreshed on every call, and the model answers with the JSON object as text.
 *   It was the best or tied for best in every eval (accuracy, cost, cache hits) and works with any provider.
 * - `function_calling`: one call per cycle. A single `step` tool carries the whole response (reasoning, state,
 *   learned and the actions, each with its arguments as a JSON string) and the model is forced to call it.
 *   Tied with `plain_chat` in accuracy and similar in cost. Requires a provider with forced tool choice, and the
 *   history is sent back as tool call / tool result pairs.
 * - `function_calling_split`: native function calling in the same request: a forced `reflect` tool (reasoning,
 *   state, learned) plus every catalog tool declared natively. It was the worst of the function calling setups in
 *   the evals. Experimental, not validated with the real skills.
 * - `legacy_tools_off`: the old production behavior. The tools are declared in the request but tool calls are
 *   disabled (`toolChoice: 'none'`) and the model must write the JSON as text. WARNING: DO NOT USE unless you know
 *   exactly what you are doing. In the evals it scored 0 to 30% accuracy on the real reasoning engine (the same
 *   models score 80 to 100% with `plain_chat`) because the model is told that tools exist while being forbidden to
 *   call them. It is kept only so a specific provider or model can be used with it if a future eval proves it scores
 *   better there. Nothing so far suggests that such a case exists.
 */
export type SkillMode = 'plain_chat' | 'function_calling' | 'function_calling_split' | 'legacy_tools_off'

export const DEFAULT_SKILL_MODE: SkillMode = 'plain_chat'

export const SKILL_MODES: SkillMode[] = ['plain_chat', 'function_calling', 'function_calling_split', 'legacy_tools_off']

export const STEP_TOOL = 'step'
export const REFLECT_TOOL = 'reflect'

const STEP_ADDENDUM = 'DELIVERY: instead of printing the JSON object, deliver every response by calling the tool "step" exactly once with the same content: reasoning, state (objective, progress, tried, expecting, next), learned and actions. Each action has "tool" and "arguments_json", which is the arguments object serialized as a JSON string.'

const SPLIT_ADDENDUM = 'DELIVERY: instead of printing the JSON object, deliver every response with tool calls. Call the tool "reflect" first with reasoning, state (objective, progress, tried, expecting, next) and learned, and in the same turn call natively each tool of your actions with its arguments.'

const STATE_SCHEMA = {
    type: 'object',
    properties: { objective: { type: 'string' }, progress: { type: 'string' }, tried: { type: 'string' }, expecting: { type: 'string' }, next: { type: 'string' } },
    required: ['objective', 'progress', 'tried', 'expecting', 'next'],
    additionalProperties: false,
}

const LEARNED_SCHEMA = {
    type: 'array',
    items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'], additionalProperties: false },
}

export interface ModeCallInput {
    mode: SkillMode
    skill: string
    systemInstructions: Record<string, any>
    systemRole: boolean
    conversation: LLMMessage[]
    tools?: LLMToolDefinition[]
}

export interface ModeCall {
    messages: LLMMessage[]
    tools?: LLMToolDefinition[]
    toolChoice?: LLMToolChoice
}

function toolListMessage (tools: LLMToolDefinition[]): LLMMessage {
    return { role: 'system', content: JSON.stringify({ tool_list: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) }) }
}

function stepTool (tools: LLMToolDefinition[]): LLMToolDefinition {
    return {
        name: STEP_TOOL,
        description: 'Your single output for this cycle: reasoning, working state, learned facts and the actions to execute.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                reasoning: { type: 'string' },
                state: STATE_SCHEMA,
                learned: LEARNED_SCHEMA,
                actions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            tool: { type: 'string', enum: tools.map(tool => tool.name) },
                            arguments_json: { type: 'string', description: 'JSON object, serialized as a string, with the arguments of the chosen action.' },
                        },
                        required: ['tool', 'arguments_json'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['reasoning', 'state', 'learned', 'actions'],
            additionalProperties: false,
        },
    }
}

function reflectTool (): LLMToolDefinition {
    return {
        name: REFLECT_TOOL,
        description: 'Record your reasoning and working state for this cycle. Call it every cycle, before the tools of your actions.',
        strict: true,
        parameters: {
            type: 'object',
            properties: { reasoning: { type: 'string' }, state: STATE_SCHEMA, learned: LEARNED_SCHEMA },
            required: ['reasoning', 'state', 'learned'],
            additionalProperties: false,
        },
    }
}

function envelopeOf (message: LLMMessage): { reasoning: string, state?: any, learned: any[], actions: { tool: string, arguments: Record<string, any> }[] } | undefined {
    if (message.role !== 'assistant' || message.toolCalls?.length) return undefined

    const parsed = extractJSON(message.content)
    if (!parsed || !Array.isArray(parsed.actions)) return undefined

    return {
        reasoning: String(parsed.reasoning ?? ''),
        state: parsed.state,
        learned: Array.isArray(parsed.learned) ? parsed.learned : [],
        actions: parsed.actions.map((action: any) => ({ tool: String(action?.tool ?? ''), arguments: action?.arguments ?? {} })),
    }
}

function observationsOf (content: string): any[] | undefined {
    const parsed = extractJSON(content)
    return Array.isArray(parsed?.OBSERVATIONS) ? parsed.OBSERVATIONS : undefined
}

/**
 * Rewrites the stored text history (assistant JSON followed by the user's observations) as tool call / tool result
 * pairs, which is what the function calling modes expect to see in the conversation.
 */
function toToolHistory (conversation: LLMMessage[], mode: 'function_calling' | 'function_calling_split'): LLMMessage[] {
    const out: LLMMessage[] = []
    let cycle = 0

    for (let index = 0; index < conversation.length; index++) {
        const message = conversation[index]
        const envelope = envelopeOf(message)

        if (!envelope) {
            out.push(message)
            continue
        }

        cycle++
        const next = conversation[index + 1]
        const feedback = next?.role === 'user' ? next.content : undefined
        if (feedback !== undefined) index++

        if (mode === 'function_calling') {
            const call: LLMToolCall = {
                id: `step_${cycle}`,
                name: STEP_TOOL,
                arguments: {
                    reasoning: envelope.reasoning,
                    state: envelope.state ?? {},
                    learned: envelope.learned,
                    actions: envelope.actions.map(action => ({ tool: action.tool, arguments_json: JSON.stringify(action.arguments) })),
                },
            }

            out.push({ role: 'assistant', content: '', toolCalls: [call] })
            out.push({ role: 'tool', toolCallId: call.id, toolName: STEP_TOOL, content: feedback ?? 'ok' })
            continue
        }

        const calls: LLMToolCall[] = [
            { id: `reflect_${cycle}`, name: REFLECT_TOOL, arguments: { reasoning: envelope.reasoning, state: envelope.state ?? {}, learned: envelope.learned } },
            ...envelope.actions.map((action, position) => ({ id: `act_${cycle}_${position + 1}`, name: action.tool, arguments: action.arguments })),
        ]

        const observations = feedback === undefined ? undefined : observationsOf(feedback)
        const aligned = observations?.length === envelope.actions.length
        const results = calls.map((call, position) => position === 0 ? 'ok' : aligned ? JSON.stringify(observations![position - 1]) : 'ok')

        if (feedback !== undefined) {
            const harness = extractJSON(feedback)?.HARNESS
            const last = calls.length - 1
            results[last] = aligned ? (harness ? JSON.stringify({ observation: observations![last - 1], HARNESS: harness }) : results[last]) : feedback
        }

        out.push({ role: 'assistant', content: '', toolCalls: calls })
        calls.forEach((call, position) => out.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: results[position] }))
    }

    return out
}

/**
 * Builds what is sent to the model for the chosen mode: the final messages, the declared tools and the tool choice.
 */
export function buildModeCall (input: ModeCallInput): ModeCall {
    const { mode, skill, systemInstructions, systemRole, conversation, tools = [] } = input

    if (!SKILL_MODES.includes(mode)) throw new Error(`[SKILL:${skill}] unknown mode: ${mode}`)

    if (mode === 'legacy_tools_off') {
        const system: LLMMessage[] = systemRole ? [{ role: 'system', content: JSON.stringify(systemInstructions) }] : []
        return { messages: [...system, ...conversation], ...(tools.length ? { tools, toolChoice: 'none' as const } : {}) }
    }

    if (mode === 'plain_chat') {
        const system: LLMMessage[] = systemRole ? [{ role: 'system', content: JSON.stringify(systemInstructions) }] : []
        return { messages: [...system, ...(tools.length ? [toolListMessage(tools)] : []), ...conversation] }
    }

    if (!systemRole) throw new Error(`[SKILL:${skill}] ${mode} requires systemRole`)
    if (!tools.length) throw new Error(`[SKILL:${skill}] ${mode} requires tools`)

    const addendum = mode === 'function_calling' ? STEP_ADDENDUM : SPLIT_ADDENDUM

    return {
        messages: [{ role: 'system', content: JSON.stringify({ ...systemInstructions, delivery: addendum }) }, toolListMessage(tools), ...toToolHistory(conversation, mode)],
        tools: mode === 'function_calling' ? [stepTool(tools)] : [reflectTool(), ...tools.map(tool => ({ ...tool, strict: true }))],
        toolChoice: 'required',
    }
}

function parseArguments (skill: string, tool: string, value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
    if (typeof value !== 'string') throw new Error(`[SKILL:${skill}] arguments of ${tool} are not a JSON object`)

    try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
        const recovered = extractJSON(value)
        if (recovered && Object.keys(recovered).length) return recovered
        if (/^\s*\{\s*\}\s*$/.test(value)) return {}
    }

    throw new Error(`[SKILL:${skill}] arguments of ${tool} are not valid JSON`)
}

export interface ModeReading {
    text: string
    blocks: number
    chosen: number
}

export interface ReadOptions {
    expectActions?: boolean
}

function isComplete (object: Record<string, any> | undefined, expectActions: boolean) {
    if (!object || !Object.keys(object).length) return false
    if (!expectActions) return true

    return typeof object.reasoning === 'string' && Array.isArray(object.actions) && object.actions.length > 0
}

/**
 * Some models (for example gpt-6-luna through the OpenAI Responses API) answer with several text blocks in one
 * message: a "commentary" block and a "final_answer" block. They are not alternatives of the same answer: a later
 * block can be an invented continuation written before the actions of the first one ran. The first block that is a
 * complete response is used and the rest are discarded; when none is complete, the first block with a JSON object.
 */
function pickBlock (response: LLMResponse, expectActions: boolean): ModeReading {
    const blocks = response.textBlocks?.length ? response.textBlocks : [response.text]
    if (blocks.length === 1) return { text: blocks[0] ?? '', blocks: 1, chosen: 0 }

    const objects = blocks.map(block => extractJSON(block))
    const complete = objects.findIndex(object => isComplete(object, expectActions))
    const chosen = complete !== -1 ? complete : Math.max(objects.findIndex(object => isComplete(object, false)), 0)

    return { text: blocks[chosen], blocks: blocks.length, chosen }
}

/**
 * Turns the model response into the text the skill parses. For the text modes it is the response text itself (the
 * first complete block when the model sends several); for the function calling modes the tool calls are folded back
 * into the same JSON object the text modes produce.
 */
export function readModeResponse (mode: SkillMode, skill: string, response: LLMResponse, options: ReadOptions = {}): ModeReading {
    if (mode === 'plain_chat' || mode === 'legacy_tools_off') return pickBlock(response, options.expectActions ?? false)

    const single = (text: string): ModeReading => ({ text, blocks: 1, chosen: 0 })

    if (mode === 'function_calling') {
        const call = response.toolCalls.find(item => item.name === STEP_TOOL)
        if (!call) return single(response.text)

        const actions = Array.isArray(call.arguments.actions) ? call.arguments.actions : []

        return single(JSON.stringify({
            reasoning: call.arguments.reasoning,
            state: call.arguments.state,
            learned: call.arguments.learned,
            actions: actions.map((action: any) => ({ tool: action?.tool, arguments: parseArguments(skill, String(action?.tool), action?.arguments_json) })),
        }))
    }

    const reflect = response.toolCalls.find(item => item.name === REFLECT_TOOL)
    const actions = response.toolCalls.filter(item => item.name !== REFLECT_TOOL)
    if (!reflect && !actions.length) return single(response.text)

    return single(JSON.stringify({
        reasoning: reflect?.arguments.reasoning ?? '',
        state: reflect?.arguments.state ?? {},
        learned: reflect?.arguments.learned ?? [],
        actions: actions.map(action => ({ tool: action.name, arguments: action.arguments })),
    }))
}
