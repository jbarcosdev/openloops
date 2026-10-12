import { readdirSync } from 'fs'
import { join } from 'path'
import type { Api, Model } from '@earendil-works/pi-ai'
import { CASES, CASES_VERSION } from '../cases'
import { checkAccess, findModel, FORCED_BY_API, incompatibility, loadModels, piAiVersion } from './catalog'
import { DEFAULTS, type ModelEvalSpec } from './define'
import { MODES } from './modes'
import { cellName, logDone, runCell, type PlanItem, type Progress } from './runner'
import { writeResult } from './store'
import { DEFAULT_MODES, type CaseDef, type ModeDef, type ModeId, type Strict } from './types'
import { formatTime, usd } from './util'

export interface Overrides {
    snapshots?: string[]
    reasoning?: string[]
    modes?: ModeId[]
    withToolsOff?: boolean
    strict?: Strict[]
    cases?: string[]
    runs?: number
    callTimeoutMs?: number
    concurrency?: number
    dryRun?: boolean
}

export interface LoadedSpec {
    name: string
    spec: ModelEvalSpec
}

export interface Suite {
    kind: 'model' | 'skill'
    skill?: { name: string, version?: string }
    cases: CaseDef[]
    casesVersion: number
    modes: Partial<Record<ModeId, ModeDef>>
    defaultModes: ModeId[]
    estimate?: { promptTokens: number, turnsPerRun: number, outputTokens: number }
}

export const MODEL_SUITE: Suite = { kind: 'model', cases: CASES, casesVersion: CASES_VERSION, modes: MODES, defaultModes: DEFAULT_MODES, estimate: { promptTokens: 600, turnsPerRun: 2.4, outputTokens: 200 } }

export function loadSpecs (): LoadedSpec[] {
    const directory = join(__dirname, '..', 'models')
    const files = readdirSync(directory).filter(file => /\.(ts|js)$/.test(file) && !file.endsWith('.d.ts') && !file.startsWith('_')).sort()

    return files.map(file => {
        const loaded = require(join(directory, file))
        const spec = (loaded.default ?? loaded) as ModelEvalSpec
        if (!spec?.provider || !spec?.model) throw new Error(`models/${file} must export default defineModelEval({ provider, model })`)
        return { name: file.replace(/\.(ts|js)$/, ''), spec }
    })
}

export function select (specs: LoadedSpec[], selectors: string[]) {
    if (!selectors.length) return specs

    return selectors.flatMap(selector => {
        const matches = specs.filter(item => item.name === selector || item.spec.model === selector || `${item.spec.provider}/${item.spec.model}` === selector || (item.spec.snapshots ?? []).includes(selector))
        if (!matches.length) throw new Error(`no model file matches "${selector}". Available: ${specs.map(item => item.name).join(', ')}`)
        return matches
    }).filter((item, index, list) => list.indexOf(item) === index)
}

interface Target {
    name: string
    spec: ModelEvalSpec
    snapshot: string
}

export async function runSuite (suite: Suite, selected: LoadedSpec[], overrides: Overrides) {
    const models = await loadModels()
    const started = Date.now()
    const targets: Target[] = selected.flatMap(item => (overrides.snapshots ?? item.spec.snapshots ?? [item.spec.model]).map(snapshot => ({ name: item.name, spec: item.spec, snapshot })))

    const resolved = await Promise.all(targets.map(async target => {
        const model = findModel(models, target.spec.provider, target.snapshot)
        if (!model) return { target, error: 'not in the pi-ai catalog (update pi-ai?)' }
        const problem = overrides.dryRun ? undefined : await checkAccess(models, model)
        return problem ? { target, error: `no access: ${problem}` } : { target, model }
    }))

    for (const item of resolved) console.error(item.error ? `skip   ${item.target.spec.provider}/${item.target.snapshot}: ${item.error}` : `${overrides.dryRun ? 'found ' : 'access'} ${item.target.spec.provider}/${item.target.snapshot}: ${overrides.dryRun ? 'in catalog' : 'ok'}`)

    const runnable = resolved.filter(item => item.model) as Array<{ target: Target, model: Model<Api> }>

    const plans = runnable.map(({ target, model }) => {
        const spec = target.spec
        const reasoningLevels = (model as any).reasoning ? (overrides.reasoning ?? spec.reasoning ?? DEFAULTS.reasoning) : ['n/a']
        const baseModes = overrides.modes ?? spec.modes ?? suite.defaultModes
        const modeIds = overrides.withToolsOff && !baseModes.includes('tools-off') && suite.modes['tools-off'] ? ['tools-off' as ModeId, ...baseModes] : baseModes
        const strictLevels = overrides.strict ?? spec.strict ?? DEFAULTS.strict
        const caseIds = overrides.cases ?? spec.cases ?? suite.cases.map(item => item.id)
        const cases = caseIds.map(id => {
            const found = suite.cases.find(item => item.id === id)
            if (!found) throw new Error(`unknown case "${id}". Available: ${suite.cases.map(item => item.id).join(', ')}`)
            return found
        })
        const forced = FORCED_BY_API[model.api]
        const planned: PlanItem[] = []
        const skipped: string[] = []

        for (const modeId of modeIds) {
            const mode = suite.modes[modeId]
            if (!mode) {
                skipped.push(`${modeId}: not available in this suite`)
                continue
            }

            for (const level of reasoningLevels) {
                const problem = incompatibility(model, mode.forcesToolChoice, level)
                if (problem) {
                    skipped.push(`${modeId} reasoning=${level}: ${problem}`)
                    continue
                }

                for (const strict of mode.usesStrict ? strictLevels : ['off' as Strict]) planned.push({ mode, strict: strict === 'on', level })
            }
        }

        return { target, model, forced, planned, skipped, cases, reasoningLevels, modeIds, strictLevels, runs: overrides.runs ?? spec.runs ?? DEFAULTS.runs }
    })

    const total = plans.reduce((sum, plan) => sum + plan.planned.length, 0)
    const conversations = plans.reduce((sum, plan) => sum + plan.planned.length * plan.cases.length * plan.runs, 0)
    const progress: Progress = { done: 0, total, started: Date.now(), cost: 0 }
    console.error(`plan: ${plans.length} snapshots, ${total} cells, ${conversations} conversations`)

    if (overrides.dryRun) {
        const guess = suite.estimate ?? { promptTokens: 600, turnsPerRun: 2.4, outputTokens: 200 }
        const rows = plans.flatMap(plan => plan.planned.map(item => {
            const price = (plan.model as any).cost ?? {}
            const calls = plan.cases.length * plan.runs * guess.turnsPerRun
            const thinking = item.level === 'off' || item.level === 'n/a' ? 1 : 3
            const cost = calls * ((guess.promptTokens + 700) * (price.input ?? 0) + guess.outputTokens * thinking * (price.output ?? 0)) / 1e6
            return { model: `${plan.target.spec.provider}/${plan.target.snapshot}`, mode: item.mode.id, reasoning: item.level, strict: item.mode.usesStrict ? (item.strict ? 'on' : 'off') : '-', conversations: plan.cases.length * plan.runs, estimate: usd(cost), cost }
        }))
        console.table(rows.map(({ cost, ...row }) => row))
        console.log(`dry run, nothing was sent. Rough estimate ${usd(rows.reduce((sum, row) => sum + row.cost, 0))} without prompt caching (real cost is usually lower). Prompt size used: ~${guess.promptTokens} tokens plus ~700 of conversation per call.`)
        for (const plan of plans) for (const note of plan.skipped) console.log(`skipped ${plan.target.snapshot} ${note}`)
        return { results: [] as Array<{ result: any, file: string }>, elapsed: '00:00' }
    }

    const results = await Promise.all(plans.map(async plan => {
        const { target, model } = plan
        const label = `${target.spec.provider}/${target.snapshot}`
        const startedAt = Date.now()
        const cells: any[] = []

        for (const item of plan.planned) {
            const name = cellName(label, item)
            console.error(`[${progress.done + 1}/${progress.total}] start  ${name}`)
            const outcome = await runCell(models, model, item, plan.forced ?? '', { runs: plan.runs, cases: plan.cases, callTimeoutMs: overrides.callTimeoutMs ?? DEFAULTS.callTimeoutMs, concurrency: overrides.concurrency ?? DEFAULTS.concurrency })
            logDone(name, outcome.summary, progress)
            cells.push({ mode: item.mode.id, reasoning: item.level, strict: item.mode.usesStrict ? (item.strict ? 'on' : 'off') : '-', ...outcome })
        }

        const sum = (key: string) => cells.reduce((acc, cell) => acc + (cell.summary[key] ?? 0), 0)

        const result = {
            schema: 1,
            kind: suite.kind,
            ...(suite.skill ? { skill: suite.skill.name, skillVersion: suite.skill.version } : {}),
            casesVersion: suite.casesVersion,
            name: target.name,
            provider: target.spec.provider,
            model: target.spec.model,
            snapshot: target.snapshot,
            api: model.api,
            startedAt: new Date(startedAt).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            piAiVersion: piAiVersion(),
            pricing: (model as any).cost,
            notes: target.spec.notes,
            config: { runs: plan.runs, reasoning: plan.reasoningLevels, modes: plan.modeIds, strict: plan.strictLevels, cases: plan.cases.map(item => item.id), callTimeoutMs: overrides.callTimeoutMs ?? DEFAULTS.callTimeoutMs },
            totals: { runs: sum('runs'), correctRuns: sum('correctRuns'), calls: sum('turns'), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), reasoningTokens: sum('reasoningTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'), cost: sum('cost') },
            skipped: plan.skipped,
            cells,
        }

        return { result, file: writeResult(result) }
    }))

    return { results, elapsed: formatTime(Date.now() - started) }
}

export const runModels = (selected: LoadedSpec[], overrides: Overrides) => runSuite(MODEL_SUITE, selected, overrides)
