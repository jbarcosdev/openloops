import type { AssistantMessage, Message } from '@earendil-works/pi-ai'
import { matches, type SkillDefinition } from './skill-mode'
import type { Action, Built, CaseDef, Final, ModeDef, ModeId, Parsed, ToolSpec } from './types'
import { firstJson, textOf, toolCalls, toolResult, userMessage } from './util'

const OUTPUT = '__output'
const OUTPUT_TOOL = 'output'
const DELIVERY = 'DELIVERY: instead of printing the JSON object, deliver the response by calling the tool "output" exactly once, with the same fields as the response schema.'

const withStrict = (tool: any, strict: boolean) => strict ? ({ ...tool, constrainedSampling: { type: 'json_schema', strict: 'prefer' } }) : tool

function validate (schema: ToolSpec['parameters'], value: any) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'response is not an object'
    const wrong = schema.required.filter(key => !matches(schema.properties[key] ?? {}, value[key]))
    return wrong.length ? `fields missing or wrong type: ${wrong.join(',')}` : undefined
}

export function singleModes (def: SkillDefinition): Partial<Record<ModeId, ModeDef>> {
    const schema = def.outputSchema as ToolSpec['parameters']
    if (!schema) throw new Error(`skill eval "${def.name}" is kind "single" and needs outputSchema`)

    const opening = (caseDef: CaseDef) => JSON.stringify({
        CONTEXT: { now_utc: '2026-10-11T15:00:00.000Z', day_of_week: 'Sunday', ...def.context },
        INPUT: { ...(caseDef.userMessage ? { user_message: caseDef.userMessage } : {}), ...caseDef.input },
    })

    const finalOf = (action: Action): Final | undefined => action.tool === OUTPUT ? { tool: OUTPUT, text: JSON.stringify(action.arguments) } : undefined
    const outcome = (value: any, base: { calls: string[], actions: Action[] }): Parsed => {
        const issue = validate(schema, value)
        return issue ? { ...base, kind: 'invalid', detail: issue, raw: value } : { ...base, actions: [{ tool: OUTPUT, arguments: value }], kind: 'complete' }
    }
    const feedback = (message: AssistantMessage, parsed: Parsed): Message[] => [...toolCalls(message).map(call => toolResult(call, 'invalid response')), userMessage(JSON.stringify({ HARNESS: { error: parsed.detail ?? 'invalid response' } }))]

    const text: ModeDef = {
        id: 'text',
        usesStrict: false,
        forcesToolChoice: false,
        build (caseDef): Built {
            return {
                system: JSON.stringify(def.systemInstructions),
                opening: opening(caseDef),
                finalOf,
                toolChoice: () => undefined,
                feedback,
                parse (message): Parsed {
                    const calls = toolCalls(message)
                    const base = { calls: calls.map(call => call.name), actions: [] as Action[] }
                    if (calls.length) return { ...base, kind: 'invalid', detail: `native tool call in text mode: ${base.calls.join(',')}` }
                    const content = textOf(message)
                    if (!content) return { ...base, kind: 'empty', detail: 'empty text' }
                    const object = firstJson(content)
                    if (!object) return { ...base, kind: 'invalid', detail: 'no JSON object found', raw: content.slice(0, 300) }
                    return outcome(object, base)
                },
            }
        },
    }

    const structured: ModeDef = {
        id: 'schema',
        usesStrict: true,
        forcesToolChoice: true,
        build (caseDef, strict): Built {
            const tool = { name: OUTPUT_TOOL, description: 'Your response, with the fields of the response schema.', parameters: schema }

            return {
                system: JSON.stringify({ ...def.systemInstructions, delivery: DELIVERY }),
                opening: opening(caseDef),
                finalOf,
                tools: [withStrict(tool, strict)],
                toolChoice: forced => forced,
                feedback,
                parse (message): Parsed {
                    const calls = toolCalls(message)
                    const base = { calls: calls.map(call => call.name), actions: [] as Action[] }
                    if (!calls.length) return { ...base, kind: 'empty', detail: 'no tool call' }
                    const call = calls.find(item => item.name === OUTPUT_TOOL)
                    if (!call) return { ...base, kind: 'invalid', detail: `no output call, got: ${base.calls.join(',')}` }
                    return outcome(call.arguments, base)
                },
            }
        },
    }

    return { text, schema: structured }
}
