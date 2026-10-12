import type { AssistantMessage, Message } from '@earendil-works/pi-ai'
import type { Action, Built, CaseDef, Final, ModeDef, ModeId, Parsed, ToolSpec, WorldCtx } from './types'
import { firstJson, parseJsonString, textOf, toolCalls, toolResult, userMessage } from './util'

export interface SkillDefinition {
    name: string
    version?: string
    systemInstructions: Record<string, any>
    nativeTools: ToolSpec[]
    finals: Record<string, string>
    context?: Record<string, any>
    maxTurns?: number
    maxToolCalls?: number
}

const NAMESPACE = /^functions\./

const normalize = (name: string) => name.toLowerCase().replace(/-/g, '_')

function resolveName (written: string, declared: string[]) {
    const name = String(written ?? '').trim().replace(NAMESPACE, '')
    if (declared.includes(name)) return name
    const same = declared.filter(candidate => normalize(candidate) === normalize(name))
    if (same.length === 1) return same[0]
    const suffixed = declared.filter(candidate => candidate.includes('__') && normalize(candidate).endsWith(`__${normalize(name)}`))
    return suffixed.length === 1 ? suffixed[0] : undefined
}

function matches (schema: any, value: any) {
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false
    switch (schema.type) {
        case 'string': return typeof value === 'string'
        case 'number':
        case 'integer': return typeof value === 'number'
        case 'boolean': return typeof value === 'boolean'
        case 'array': return Array.isArray(value)
        case 'object': return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        default: return true
    }
}

function checkArguments (tool: ToolSpec, args: any) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return `${tool.name} arguments is ${Array.isArray(args) ? 'array' : typeof args}`
    const wrong = tool.parameters.required.filter(key => !matches(tool.parameters.properties[key] ?? {}, args[key]))
    return wrong.length ? `${tool.name} arguments missing or wrong type: ${wrong.join(',')}` : undefined
}

function checkEnvelope (value: any) {
    if (!value || typeof value !== 'object') return 'response is not an object'
    if (typeof value.reasoning !== 'string') return `reasoning is ${typeof value.reasoning}`
    if (!value.state || typeof value.state !== 'object' || Array.isArray(value.state)) return `state is ${Array.isArray(value.state) ? 'array' : typeof value.state}`
    if (value.learned !== undefined && !Array.isArray(value.learned)) return `learned is ${typeof value.learned}`
    return undefined
}

function resolveActions (tools: ToolSpec[], requests: any[]): { actions: Action[], issue?: string } {
    if (!requests.length) return { actions: [], issue: 'actions is empty' }
    const declared = tools.map(tool => tool.name)
    const actions: Action[] = []

    for (const request of requests) {
        const name = resolveName(request?.tool, declared)
        const tool = tools.find(item => item.name === name)
        if (!tool) return { actions, issue: `action: unknown action tool: ${request?.tool}` }
        const problem = checkArguments(tool, request?.arguments ?? {})
        if (problem) return { actions, issue: `action: ${problem}` }
        actions.push({ tool: tool.name, arguments: request?.arguments ?? {} })
    }

    return { actions }
}

function observationOf (caseDef: CaseDef, action: Action, ref: string, ctx: WorldCtx) {
    ctx.calls.push(action)
    let output: string

    try {
        output = caseDef.world(action.tool, action.arguments, ctx)
    } catch (error: any) {
        output = JSON.stringify({ error: String(error?.message ?? error) })
    }

    let parsed: any = output

    try {
        parsed = JSON.parse(output)
    } catch {
        parsed = output
    }

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error
        ? { ref, tool: action.tool, status: 'failed', error: typeof parsed.message === 'string' ? `${parsed.error}: ${parsed.message}` : String(parsed.error) }
        : { ref, tool: action.tool, status: 'completed', output: parsed }
}

function harnessNotice (def: SkillDefinition, turn: number, ctx: WorldCtx) {
    return { budget: { turns_left: (def.maxTurns ?? 20) - turn, tool_calls_left: (def.maxToolCalls ?? 40) - ctx.calls.length } }
}

const STEP_ADDENDUM = 'DELIVERY: instead of printing the JSON object, deliver every response by calling the tool "step" exactly once with the same content: reasoning, state (objective, progress, tried, expecting, next), learned and actions. Each action has "tool" and "arguments_json", which is the arguments object serialized as a JSON string.'

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

const withStrict = (tool: any, strict: boolean) => strict ? ({ ...tool, constrainedSampling: { type: 'json_schema', strict: 'prefer' } }) : tool

export function skillModes (def: SkillDefinition): Partial<Record<ModeId, ModeDef>> {
    const toolsOf = (caseDef: CaseDef) => [...caseDef.tools, ...def.nativeTools]

    const finalOf = (action: Action): Final | undefined => {
        const field = def.finals[action.tool]
        return field ? { tool: action.tool, text: String(action.arguments?.[field] ?? '') } : undefined
    }

    const opening = (caseDef: CaseDef, listTools: boolean) => JSON.stringify({
        CONTEXT: { now_utc: '2026-10-11T15:00:00.000Z', day_of_week: 'Sunday', ...def.context, ...(listTools ? { tool_list: toolsOf(caseDef).map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) } : {}) },
        INPUT: { user_message: caseDef.userMessage },
    })

    const system = JSON.stringify(def.systemInstructions)

    const textParse = (caseDef: CaseDef) => (message: AssistantMessage): Parsed => {
        const calls = toolCalls(message)
        const base = { calls: calls.map(call => call.name), actions: [] as Action[] }

        if (calls.length) return { ...base, kind: 'invalid', detail: `native tool call in text mode: ${base.calls.join(',')}` }

        const text = textOf(message)
        if (!text) return { ...base, kind: 'empty', detail: 'empty text' }

        const object = firstJson(text)
        if (!object) return { ...base, kind: 'invalid', detail: 'no JSON object found', raw: text.slice(0, 300) }

        const envelope = checkEnvelope(object)
        if (envelope) return { ...base, kind: 'invalid', detail: envelope, raw: object }

        const { actions, issue } = resolveActions(toolsOf(caseDef), Array.isArray(object.actions) ? object.actions : [])
        if (issue) return { ...base, actions, kind: 'invalid', detail: issue, raw: object }

        return { ...base, actions, kind: 'complete' }
    }

    const feedbackFor = (caseDef: CaseDef, ctx: WorldCtx, turnOf: () => number) => (parsed: Parsed): string => {
        const turn = turnOf()
        const observations = parsed.kind === 'complete'
            ? parsed.actions.map((action, index) => observationOf(caseDef, action, `${turn}_${index + 1}`, ctx))
            : [{ ref: `${turn}_1`, tool: 'invalid_response', status: 'failed', error: parsed.detail ?? 'invalid response' }]

        return JSON.stringify({ OBSERVATIONS: observations, HARNESS: harnessNotice(def, turn, ctx) })
    }

    const toolsOff: ModeDef = {
        id: 'tools-off',
        usesStrict: false,
        forcesToolChoice: false,
        build (caseDef, strict, ctx): Built {
            let turn = 0
            const feedback = feedbackFor(caseDef, ctx, () => ++turn)

            return {
                system,
                opening: opening(caseDef, false),
                finalOf,
                tools: toolsOf(caseDef),
                toolChoice: () => 'none',
                parse: textParse(caseDef),
                feedback: (message, parsed): Message[] => [...toolCalls(message).map(call => toolResult(call, 'tool calls are not allowed here')), userMessage(feedback(parsed))],
            }
        },
    }

    const text: ModeDef = {
        id: 'text',
        usesStrict: false,
        forcesToolChoice: false,
        build (caseDef, strict, ctx): Built {
            let turn = 0
            const feedback = feedbackFor(caseDef, ctx, () => ++turn)

            return {
                system,
                opening: opening(caseDef, true),
                finalOf,
                toolChoice: () => undefined,
                parse: textParse(caseDef),
                feedback: (message, parsed): Message[] => [...toolCalls(message).map(call => toolResult(call, 'tool calls are not allowed here')), userMessage(feedback(parsed))],
            }
        },
    }

    const step: ModeDef = {
        id: 'fc-step',
        usesStrict: true,
        forcesToolChoice: true,
        build (caseDef, strict, ctx): Built {
            let turn = 0
            const feedback = feedbackFor(caseDef, ctx, () => ++turn)

            const stepTool = {
                name: 'step',
                description: 'Your single output for this cycle: reasoning, working state, learned facts and the actions to execute.',
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
                                properties: { tool: { type: 'string', enum: toolsOf(caseDef).map(tool => tool.name) }, arguments_json: { type: 'string', description: 'JSON object, serialized as a string, with the arguments of the chosen action.' } },
                                required: ['tool', 'arguments_json'],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ['reasoning', 'state', 'learned', 'actions'],
                    additionalProperties: false,
                },
            }

            return {
                system: JSON.stringify({ ...def.systemInstructions, delivery: STEP_ADDENDUM }),
                opening: opening(caseDef, true),
                finalOf,
                tools: [withStrict(stepTool, strict)],
                toolChoice: forced => forced,
                parse (message): Parsed {
                    const calls = toolCalls(message)
                    const names = calls.map(call => call.name)
                    const base = { calls: names, actions: [] as Action[] }

                    if (!calls.length) return { ...base, kind: 'empty' }

                    const call = calls.find(item => item.name === 'step')
                    if (!call) return { ...base, kind: 'invalid', detail: `no step call, got: ${names.join(',')}` }

                    const args = call.arguments
                    const envelope = checkEnvelope(args)
                    if (envelope) return { ...base, kind: 'invalid', detail: envelope, raw: args }
                    if (!Array.isArray(args.actions)) return { ...base, kind: 'invalid', detail: `actions is ${typeof args.actions}`, raw: args }

                    let recovered = false
                    const requests: any[] = []

                    for (const item of args.actions) {
                        const parsed = parseJsonString(item?.arguments_json)
                        if (!parsed) return { ...base, kind: 'invalid', detail: `action: ${item?.tool} arguments_json is not valid JSON`, raw: args }
                        recovered = recovered || parsed.recovered
                        requests.push({ tool: item.tool, arguments: parsed.value })
                    }

                    const { actions, issue } = resolveActions(toolsOf(caseDef), requests)
                    if (issue) return { ...base, actions, kind: 'invalid', detail: issue, raw: args, recovered }

                    return { ...base, actions, kind: 'complete', recovered }
                },
                feedback: (message, parsed): Message[] => toolCalls(message).map(call => toolResult(call, call.name === 'step' ? feedback(parsed) : 'not allowed')),
            }
        },
    }

    return { 'tools-off': toolsOff, text, 'fc-step': step }
}
