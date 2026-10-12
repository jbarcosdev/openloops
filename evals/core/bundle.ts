import { mkdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { renderHtml } from './html'
import { listSnapshots, loadRef, readEntry, RESULTS_DIR } from './store'
import { stamp } from './util'

const trim = (value: any, size: number) => value === undefined ? undefined : (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, size)

const digestRun = (run: any, full: boolean) => ({
    case: run.caseId,
    correct: run.correct,
    reason: run.reason,
    answer: trim(run.answer, full ? 2000 : 400),
    ms: run.ms,
    turns: run.turns.map((turn: any) => ({
        turn: turn.turn,
        kind: turn.kind,
        calls: turn.calls,
        actions: turn.actions,
        stop: turn.stopReason,
        ms: turn.ms,
        outputTokens: turn.outputTokens,
        reasoningTokens: turn.reasoningTokens,
        thinkingBlocks: turn.thinkingBlocks || undefined,
        recovered: turn.recovered,
        detail: turn.detail,
        error: turn.error,
        raw: trim(turn.raw, full ? 700 : 250),
    })),
})

function digestCell (cell: any, full: boolean, light: boolean) {
    const issues = new Map<string, number>()

    for (const run of cell.runs) {
        if (!run.correct && run.reason) issues.set(`${run.caseId}: ${run.reason}`, (issues.get(`${run.caseId}: ${run.reason}`) ?? 0) + 1)
        for (const turn of run.turns) {
            const issue = turn.error ?? turn.detail
            if (issue) issues.set(issue.slice(0, 200), (issues.get(issue.slice(0, 200)) ?? 0) + 1)
        }
    }

    const byCase = Object.fromEntries(Object.entries(cell.byCase).map(([id, summary]: any) => [id, { correct: `${summary.correctRuns}/${summary.runs}`, avgMsPerCall: summary.avgMsPerCall, maxMsPerCall: summary.maxMsPerCall, turnsPerRun: summary.avgTurnsPerRun, errors: summary.errors, cost: Number(summary.cost.toFixed(5)) }]))
    const base = {
        mode: cell.mode,
        reasoning: cell.reasoning,
        strict: cell.strict,
        summary: cell.summary,
        byCase,
        issues: [...issues].sort((a, b) => b[1] - a[1]).map(([issue, count]) => ({ issue, count })),
    }

    if (light) return base

    const passedSamples = [...new Set(cell.runs.filter((run: any) => run.correct).map((run: any) => run.caseId))].map(id => cell.runs.find((run: any) => run.correct && run.caseId === id))

    return {
        ...base,
        failedRuns: cell.runs.filter((run: any) => !run.correct).map((run: any) => digestRun(run, full)),
        passedSamples: full ? cell.runs.filter((run: any) => run.correct).map((run: any) => digestRun(run, full)) : passedSamples.map(run => digestRun(run, full)),
    }
}

const digestResult = (label: string, result: any, full: boolean, light: boolean) => ({
    ref: label,
    kind: result.kind ?? 'model',
    skill: result.skill,
    skillVersion: result.skillVersion,
    model: result.model,
    provider: result.provider,
    snapshot: result.snapshot,
    api: result.api,
    startedAt: result.startedAt,
    piAiVersion: result.piAiVersion,
    casesVersion: result.casesVersion ?? 1,
    pricing: result.pricing,
    config: result.config,
    totals: result.totals,
    skipped: result.skipped,
    cells: result.cells.map((cell: any) => digestCell(cell, full, light)),
})

export const groupKey = (result: any) => `${result.kind ?? 'model'}|${result.skill ?? ''}|${result.provider}|${result.snapshot}`

export interface BundleOptions {
    kind?: 'model' | 'skill'
    skill?: string
    last?: boolean
    stamp?: string
    full: boolean
    out?: string
    history?: boolean
    only?: any[]
}

const LAST_WINDOW_MS = 10 * 60 * 1000

function loadEverything (kind: 'model' | 'skill') {
    const seen = new Set<string>()
    const found: Array<{ label: string, result: any }> = []

    for (const item of listSnapshots()) {
        if (item.kind !== kind) continue
        for (const name of item.stamps) {
            const entry = readEntry(item, name)
            const key = `${groupKey(entry.result)}|${entry.result.startedAt}`
            if (seen.has(key)) continue
            seen.add(key)
            found.push(entry)
        }
    }

    return found.sort((a, b) => String(a.result.startedAt).localeCompare(String(b.result.startedAt)))
}

const sameSetup = (a: any, b: any) => JSON.stringify(a.config?.cases) === JSON.stringify(b.config?.cases) && a.skillVersion === b.skillVersion

export function buildBundle (refs: string[], options: BundleOptions) {
    let latest: Array<{ label: string, result: any }>
    let previous: Array<{ label: string, result: any }> = []
    let kind: 'model' | 'skill' = options.kind ?? 'model'
    let skill = options.skill

    if (refs.length) {
        latest = refs.map(loadRef)
        kind = latest[0].result.kind === 'skill' ? 'skill' : 'model'
        skill = latest[0].result.skill
    } else {
        const wanted = options.only ? new Set(options.only.map(groupKey)) : undefined
        const groups = new Map<string, Array<{ label: string, result: any }>>()
        const everything = loadEverything(kind).filter(entry => !skill || entry.result.skill === skill)

        for (const entry of everything) {
            const key = groupKey(entry.result)
            if (wanted && !wanted.has(key)) continue
            groups.set(key, [...(groups.get(key) ?? []), entry])
        }

        const newest = everything.length ? Math.max(...everything.map(entry => Date.parse(entry.result.startedAt))) : 0
        latest = []

        for (const runs of groups.values()) {
            let candidates = options.stamp ? runs.filter(entry => entry.label.split('@')[1]?.startsWith(options.stamp as string)) : runs
            if (options.last) candidates = candidates.filter(entry => Date.parse(entry.result.startedAt) >= newest - LAST_WINDOW_MS)
            if (!candidates.length) continue
            const chosen = candidates[candidates.length - 1]
            latest.push(chosen)
            if (options.history !== false) previous.push(...runs.filter(entry => entry !== chosen && entry.result.startedAt < chosen.result.startedAt && (kind === 'model' || sameSetup(entry.result, chosen.result))))
        }
    }

    if (!latest.length) throw new Error(kind === 'skill' ? `no results to bundle for skill "${skill ?? ''}", run eval:skills first` : 'no results to bundle, run eval:models first')

    const bundle = {
        schema: 2,
        kind: 'bundle',
        scope: kind,
        ...(skill ? { skill } : {}),
        generatedAt: new Date().toISOString(),
        full: options.full,
        note: kind === 'skill'
            ? 'results holds the run of every model of one skill, each with its modes. cells.summary has aggregates; failedRuns lists every failed conversation with its answer, reason and per-turn detail; passedSamples has one passing conversation per scenario. history holds older runs of the same skill version and scenarios, aggregates only.'
            : 'results holds the newest run of every model snapshot. cells.summary has aggregates; failedRuns lists every failed conversation with its answer, reason and per-turn detail; passedSamples has one passing conversation per case. history holds older runs of the same snapshots, aggregates only, to compare evolution over time (compare only entries with the same casesVersion).',
        results: latest.map(({ label, result }) => digestResult(label, result, options.full, false)),
        history: previous.map(({ label, result }) => digestResult(label, result, options.full, true)),
    }

    const directory = join(RESULTS_DIR, 'bundles', kind === 'skill' ? 'skills' : 'models')
    mkdirSync(directory, { recursive: true })
    const file = options.out ?? join(directory, `${kind === 'skill' ? skill ?? 'skill' : 'bundle'}-${stamp()}.json`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(bundle, null, 1))
    const html = file.replace(/\.json$/, '') + '.html'
    writeFileSync(html, renderHtml(bundle))
    return { file, html, kilobytes: Math.round(statSync(file).size / 1024), snapshots: latest.length, history: previous.length }
}

export function announceBundle (done: { file: string, html: string, kilobytes: number, snapshots: number, history: number }) {
    console.log('\nBundles generated:')
    console.log(`  HTML report (open it in your browser, it is for you): ${done.html}`)
    console.log(`  JSON bundle (give it to an agent if you want it analyzed, it has the failure details): ${done.file}`)
    console.log(`  Contains ${done.snapshots} snapshots and ${done.history} earlier runs for comparison (${done.kilobytes} KB).`)
}
