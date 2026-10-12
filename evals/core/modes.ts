import type { AssistantMessage, Message } from '@earendil-works/pi-ai'
import type { Action, Built, CaseDef, Final, ModeDef, ModeId, Parsed, ToolSpec, WorldCtx } from './types'
import { firstJson, parseJsonString, textOf, toolCalls, toolResult, userMessage } from './util'

const RESPOND: ToolSpec = {
    name: 'respond',
    description: 'Send the final answer to the user.',
    parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
}

const STATE_SCHEMA = {
    type: 'object',
    properties: { objective: { type: 'string' }, progress: { type: 'string' }, next: { type: 'string' } },
    required: ['objective', 'progress', 'next'],
    additionalProperties: false,
}

const LEARNED_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
        additionalProperties: false,
    },
}

const REFLECT_TOOL = {
    name: 'reflect',
    description: 'Record your reasoning and working state for this turn. Call it every turn, before the action tool.',
    parameters: {
        type: 'object',
        properties: { reasoning: { type: 'string' }, state: STATE_SCHEMA, learned: LEARNED_SCHEMA },
        required: ['reasoning', 'state', 'learned'],
        additionalProperties: false,
    },
}

const JSON_RULES = [
    'You are a reasoning engine. Each turn you must answer with ONLY a JSON object, with no other text, shaped like this:',
    '{"reasoning": string, "state": {"objective": string, "progress": string, "next": string}, "learned": [{"key": string, "value": string}], "actions": [{"tool": string, "arguments": object}]}',
    '"actions" always has at least one action. When you have what you need, use the action "respond" with the final answer.',
]

const withStrict = (tool: any, strict: boolean) => strict ? ({ ...tool, constrainedSampling: { type: 'json_schema', strict: 'prefer' } }) : tool

const actionTools = (caseDef: CaseDef) => [...caseDef.tools, RESPOND]

const schemaOf = (tool: ToolSpec, key: string) => tool.parameters.properties[key] ?? {}

const typeLabel = (tool: ToolSpec, key: string) => {
    const schema = schemaOf(tool, key)
    return Array.isArray(schema.enum) ? schema.enum.map((value: any) => JSON.stringify(value)).join('|') : String(schema.type ?? 'any')
}

function matchesSchema (schema: any, value: any) {
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

const catalogLine = (tool: ToolSpec) => `- ${tool.name} {${Object.keys(tool.parameters.properties).map(key => `"${key}": ${typeLabel(tool, key)}`).join(', ')}}: ${tool.description}`

const catalogText = (caseDef: CaseDef) => 'Available actions:\n' + actionTools(caseDef).map(catalogLine).join('\n')

function checkState (state: any) {
    if (!state || typeof state !== 'object') return `state is ${typeof state}`
    const wrong = ['objective', 'progress', 'next'].filter(key => typeof state[key] !== 'string')
    return wrong.length ? `state fields missing or not string: ${wrong.join(',')}` : undefined
}

function checkEnvelope (args: any) {
    if (!args || typeof args !== 'object') return 'arguments is not an object'
    if (typeof args.reasoning !== 'string') return `reasoning is ${typeof args.reasoning}`
    const state = checkState(args.state)
    if (state) return state
    if (!Array.isArray(args.learned)) return `learned is ${typeof args.learned}`
    return undefined
}

function checkAction (caseDef: CaseDef, name: string, args: any) {
    const tool = actionTools(caseDef).find(item => item.name === name)
    if (!tool) return `unknown action tool: ${name}`
    if (!args || typeof args !== 'object') return `${name} arguments is ${typeof args}`
    const wrong = tool.parameters.required.filter(key => !matchesSchema(schemaOf(tool, key), args[key]))
    return wrong.length ? `${name} arguments missing or wrong type: ${wrong.join(',')}` : undefined
}

function checkActions (caseDef: CaseDef, actions: Action[]) {
    if (!actions.length) return 'actions is empty'
    for (const action of actions) {
        const issue = checkAction(caseDef, action.tool, action.arguments)
        if (issue) return `action: ${issue}`
    }
    return undefined
}

export const defaultFinal = (action: Action): Final | undefined => action.tool === 'respond' ? { tool: 'respond', text: String(action.arguments?.message ?? '') } : undefined

export function observe (caseDef: CaseDef, action: Action, ctx: WorldCtx) {
    if (action.tool === 'respond') return 'delivered'
    ctx.calls.push(action)
    try {
        return caseDef.world(action.tool, action.arguments, ctx)
    } catch (error: any) {
        return JSON.stringify({ error: String(error?.message ?? error) })
    }
}

const observationsOf = (caseDef: CaseDef, actions: Action[], ctx: WorldCtx) => JSON.stringify(actions.map(action => ({ tool: action.tool, result: observe(caseDef, action, ctx) })))

function textParser (caseDef: CaseDef) {
    return (message: AssistantMessage): Parsed => {
        const calls = toolCalls(message)
        const base = { calls: calls.map(call => call.name), actions: [] as Action[] }

        if (calls.length) return { ...base, kind: 'invalid', detail: `native tool call in text mode: ${base.calls.join(',')}` }

        const text = textOf(message)
        if (!text) return { ...base, kind: 'empty', detail: 'empty text' }

        const object = firstJson(text)
        if (!object) return { ...base, kind: 'invalid', detail: 'no JSON object found', raw: text.slice(0, 300) }

        const envelope = checkEnvelope(object)
        if (envelope) return { ...base, kind: 'invalid', detail: envelope, raw: object }

        const actions: Action[] = Array.isArray(object.actions) ? object.actions.map((action: any) => ({ tool: action?.tool, arguments: action?.arguments })) : []
        const issue = Array.isArray(object.actions) ? checkActions(caseDef, actions) : `actions is ${typeof object.actions}`
        if (issue) return { ...base, actions, kind: 'invalid', detail: issue, raw: object }

        return { ...base, actions, kind: 'complete' }
    }
}

function textFeedback (caseDef: CaseDef, ctx: WorldCtx) {
    return (message: AssistantMessage, parsed: Parsed): Message[] => {
        const results = toolCalls(message).map(call => toolResult(call, 'tool calls are not allowed here'))
        const note = parsed.kind === 'complete' ? `OBSERVATIONS: ${observationsOf(caseDef, parsed.actions, ctx)}` : `HARNESS: invalid response (${parsed.detail}). Reply with the JSON object only.`
        return [...results, userMessage(note)]
    }
}

const toolsOff: ModeDef = {
    id: 'tools-off',
    usesStrict: false,
    forcesToolChoice: false,
    build: (caseDef, strict, ctx): Built => ({
        finalOf: defaultFinal,
        system: [...JSON_RULES, 'The available actions are the tools declared in this request. Use their names in "actions", but never call them natively.'].join('\n'),
        tools: actionTools(caseDef),
        toolChoice: () => 'none',
        parse: textParser(caseDef),
        feedback: textFeedback(caseDef, ctx),
    }),
}

const text: ModeDef = {
    id: 'text',
    usesStrict: false,
    forcesToolChoice: false,
    build: (caseDef, strict, ctx): Built => ({
        finalOf: defaultFinal,
        system: [...JSON_RULES, catalogText(caseDef)].join('\n'),
        toolChoice: () => undefined,
        parse: textParser(caseDef),
        feedback: textFeedback(caseDef, ctx),
    }),
}

const fcSplit: ModeDef = {
    id: 'fc-split',
    usesStrict: true,
    forcesToolChoice: true,
    build: (caseDef, strict, ctx): Built => ({
        finalOf: defaultFinal,
        system: [
            'You are a reasoning engine. Each turn you must make tool calls.',
            'Always call the tool "reflect" first, and in the same turn also call the one tool that executes your decision.',
            'When you have what you need, call "respond" with the final answer.',
        ].join('\n'),
        tools: [REFLECT_TOOL, ...actionTools(caseDef)].map(tool => withStrict(tool, strict)),
        toolChoice: forced => forced,
        parse (message) {
            const calls = toolCalls(message)
            const names = calls.map(call => call.name)
            const reflect = calls.find(call => call.name === 'reflect')
            const actions = calls.filter(call => call.name !== 'reflect').map(call => ({ tool: call.name, arguments: call.arguments }))
            const reflectFirst = names[0] === 'reflect'
            const base = { calls: names, actions, reflectFirst }

            if (!calls.length) return { ...base, kind: 'empty' }

            const reflectIssue = reflect ? checkEnvelope(reflect.arguments) : undefined
            if (reflectIssue) return { ...base, kind: 'invalid', detail: `reflect: ${reflectIssue}`, raw: reflect.arguments }

            for (const action of actions) {
                const issue = checkAction(caseDef, action.tool, action.arguments)
                if (issue) return { ...base, kind: 'invalid', detail: issue, raw: action.arguments }
            }

            if (reflect && actions.length) return { ...base, kind: 'complete' }
            if (reflect) return { ...base, kind: 'reflect-only' }
            return { ...base, kind: 'action-only' }
        },
        feedback: message => toolCalls(message).map(call => toolResult(call, call.name === 'reflect' ? 'ok' : observe(caseDef, { tool: call.name, arguments: call.arguments }, ctx))),
    }),
}

const fcStep: ModeDef = {
    id: 'fc-step',
    usesStrict: true,
    forcesToolChoice: true,
    build (caseDef, strict, ctx): Built {
        const stepTool = {
            name: 'step',
            description: 'Your single output for this turn: reasoning, working state and the actions to execute.',
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
                                tool: { type: 'string', enum: actionTools(caseDef).map(tool => tool.name) },
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

        return {
            finalOf: defaultFinal,
            system: [
                'You are a reasoning engine. Each turn call the tool "step" exactly once.',
                'Put in "actions" the list of actions to execute this turn, at least one.',
                'For each action set "tool" and put in "arguments_json" a JSON object serialized as a string with exactly the fields of that action.',
                catalogText(caseDef),
                'When you have what you need, use the action "respond".',
            ].join('\n'),
            tools: [withStrict(stepTool, strict)],
            toolChoice: forced => forced,
            parse (message) {
                const calls = toolCalls(message)
                const names = calls.map(call => call.name)
                const base = { calls: names, actions: [] as Action[] }

                if (!calls.length) return { ...base, kind: 'empty' }

                const step = calls.find(call => call.name === 'step')
                if (!step) return { ...base, kind: 'invalid', detail: `no step call, got: ${names.join(',')}` }

                const args = step.arguments
                const envelope = checkEnvelope(args)
                if (envelope) return { ...base, kind: 'invalid', detail: envelope, raw: args }
                if (!Array.isArray(args.actions)) return { ...base, kind: 'invalid', detail: `actions is ${typeof args.actions}`, raw: args }

                let recovered = false
                const actions: Action[] = []

                for (const item of args.actions) {
                    const parsed = parseJsonString(item?.arguments_json)
                    if (!parsed) return { ...base, actions, kind: 'invalid', detail: `action: ${item?.tool} arguments_json is not valid JSON`, raw: args }
                    recovered = recovered || parsed.recovered
                    actions.push({ tool: item.tool, arguments: parsed.value })
                }

                const issue = checkActions(caseDef, actions)
                if (issue) return { ...base, actions, kind: 'invalid', detail: issue, raw: args, recovered }

                return { ...base, actions, kind: 'complete', recovered }
            },
            feedback: (message, parsed) => toolCalls(message).map(call => toolResult(call, call.name === 'step' ? observationsOf(caseDef, parsed.actions, ctx) : 'not allowed')),
        }
    },
}

export const MODES: Partial<Record<ModeId, ModeDef>> = { 'tools-off': toolsOff, text, 'fc-split': fcSplit, 'fc-step': fcStep }
