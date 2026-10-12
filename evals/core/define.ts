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

export interface SkillEvalSpec {
    skill: string
    models: string[]
    load: () => Promise<{ name: string, version?: string, systemInstructions: Record<string, any> }>
    nativeTools: ToolSpec[]
    finals: Record<string, string>
    scenarios: CaseDef[]
    context?: Record<string, any>
    modes?: ModeId[]
    reasoning?: string[]
    strict?: Strict[]
    runs?: number
    notes?: string
}

export const defineModelEval = (spec: ModelEvalSpec) => spec

export const defineSkillEval = (spec: SkillEvalSpec) => spec

export const DEFAULTS = {
    reasoning: ['off'],
    strict: ['on'] as Strict[],
    runs: 3,
    callTimeoutMs: 45000,
    concurrency: 6,
}
