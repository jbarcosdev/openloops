import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { SkillEvalSpec } from './define'
import { loadSpecs, runSuite, select, type LoadedSpec, type Overrides, type Suite } from './model-eval'
import { skillModes } from './skill-mode'
import type { ModeId } from './types'

export interface LoadedSkill {
    name: string
    spec: SkillEvalSpec
}

export function loadSkillSpecs (): LoadedSkill[] {
    const directory = join(__dirname, '..', 'skills')
    if (!existsSync(directory)) return []

    return readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
        .map(entry => {
            const file = ['spec.ts', 'spec.js'].map(name => join(directory, entry.name, name)).find(existsSync)
            if (!file) return undefined
            const loaded = require(file)
            return { name: entry.name, spec: (loaded.default ?? loaded) as SkillEvalSpec }
        })
        .filter((item): item is LoadedSkill => Boolean(item))
}

export function selectSkills (skills: LoadedSkill[], selectors: string[]) {
    if (!selectors.length) return skills

    return selectors.map(selector => {
        const found = skills.find(item => item.name === selector || item.spec.skill === selector)
        if (!found) throw new Error(`no skill eval matches "${selector}". Available: ${skills.map(item => item.name).join(', ') || 'none'}`)
        return found
    })
}

export async function runSkill (skill: LoadedSkill, overrides: Overrides, modelSelectors?: string[]) {
    const { spec } = skill
    const loaded = await spec.load()
    const all = loadSpecs()
    const models: LoadedSpec[] = select(all, modelSelectors?.length ? modelSelectors : spec.models).map(item => ({
        name: item.name,
        spec: { ...item.spec, snapshots: [item.spec.model], modes: spec.modes, reasoning: spec.reasoning ?? item.spec.reasoning, strict: spec.strict ?? item.spec.strict, cases: undefined, runs: spec.runs ?? item.spec.runs },
    }))

    const definition = { name: loaded.name, version: loaded.version, systemInstructions: loaded.systemInstructions, nativeTools: spec.nativeTools, finals: spec.finals, context: spec.context }
    const modes = skillModes(definition)
    const defaultModes = (spec.modes ?? Object.keys(modes)) as ModeId[]

    const suite: Suite = { kind: 'skill', skill: { name: spec.skill, version: loaded.version }, cases: spec.scenarios, casesVersion: 1, modes, defaultModes }
    return runSuite(suite, models, { ...overrides, snapshots: overrides.snapshots ?? undefined })
}
