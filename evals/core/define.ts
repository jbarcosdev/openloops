import type { CaseDef, ModeId, Strict, ToolSpec } from './types'

export interface ModelEvalSpec {
    provider: string
    model: string
    snapshots?: string[]
    reasoning?: string[]
    modes?: ModeId[]
    strict?: Strict[]
    cases?: string[]
    runs?: number
    notes?: string
}

export interface SkillLike {
    name: string
    version?: string
    systemInstructions: Record<string, any>
}

export interface SkillEvalSpec {
    skill: string
    kind?: 'loop' | 'single'
    models: string[]
    load: () => SkillLike | Promise<SkillLike>
    nativeTools?: ToolSpec[]
    finals?: Record<string, string>
    outputSchema?: ToolSpec['parameters']
    scenarios: CaseDef[]
    defaultCases?: string[]
    context?: Record<string, any>
    modes?: ModeId[]
    reasoning?: string[]
    strict?: Strict[]
    runs?: number
    notes?: string
}

export const defineModelEval = (spec: ModelEvalSpec) => spec

export const defineSkillEval = (spec: SkillEvalSpec) => spec

export const defineOutput = (properties: Record<string, any>, required = Object.keys(properties)): ToolSpec['parameters'] => ({ type: 'object', properties, required, additionalProperties: false })

export function answerJson (answer: string): Record<string, any> | undefined {
    try {
        const value = JSON.parse(answer)
        return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
    } catch {
        return undefined
    }
}

export const DEFAULTS = {
    reasoning: ['off'],
    strict: ['on'] as Strict[],
    runs: 3,
    callTimeoutMs: 45000,
    concurrency: 6,
}
