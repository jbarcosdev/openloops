import { readFileSync, writeFileSync } from 'fs'
import { printCompare, printCosts, printResult } from './core/report'
import { ALL_MODES, DEFAULT_MODES } from './core/types'
import { CASES } from './cases'
import { loadSpecs, runModels, select, type Overrides } from './core/model-eval'
import { announceBundle, buildBundle } from './core/bundle'
import { listSnapshots, loadRef, readEntry } from './core/store'
import { loadSkillSpecs, runSkill, selectSkills } from './core/skill-eval'
import { renderHtml } from './core/html'

const USAGE = `usage:
  eval models [names...] [--snapshot ids] [--reasoning off,low] [--modes text,fc-step] [--with-tools-off] [--strict on,off] [--cases ids] [--runs n] [--timeout ms] [--concurrency n]
  eval skills [skill names...] [--models names] [same flags as models]   runs the real prompt of a skill against scenarios
  eval compare <ref> <ref> [more refs]     ref = snapshot | provider/snapshot | ...@timestamp | path.json
  eval bundle [refs...] [--stamp prefix] [--full] [--no-history] [--out file]   json plus html; newest run per snapshot, earlier runs go to history (every run of models/skills already writes both)
  eval report [bundle.json]   rebuild the html report from a bundle file (or make a new bundle when omitted)
  eval show [refs...] [--stamp prefix]   print saved results as tables (latest by default)
  eval list`

function parse (argv: string[]) {
    const flags: Record<string, string> = {}
    const positional: string[] = []

    for (let index = 0; index < argv.length; index++) {
        if (argv[index].startsWith('--')) {
            flags[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : 'true'
        } else positional.push(argv[index])
    }

    return { flags, positional }
}

const csv = (value?: string) => value ? value.split(',').map(item => item.trim()).filter(Boolean) : undefined

async function main () {
    const [command, ...rest] = process.argv.slice(2)
    const { flags, positional } = parse(rest)

    const overrides = (): Overrides => ({
        snapshots: csv(flags.snapshot),
        reasoning: csv(flags.reasoning),
        modes: csv(flags.modes) as any,
        withToolsOff: flags['with-tools-off'] === 'true',
        strict: csv(flags.strict) as any,
        cases: csv(flags.cases),
        runs: flags.runs ? Number(flags.runs) : undefined,
        callTimeoutMs: flags.timeout ? Number(flags.timeout) : undefined,
        concurrency: flags.concurrency ? Number(flags.concurrency) : undefined,
    })

    if (command === 'models') {
        const selected = select(loadSpecs(), positional)
        const { results, elapsed } = await runModels(selected, overrides())

        for (const item of results) printResult(item.result)
        if (results.length) printCosts(results.map(item => item.result), elapsed)
        for (const item of results) console.log(`saved ${item.file}`)
        if (results.length) announceBundle(buildBundle([], { full: false, only: results.map(item => item.result) }))
        return
    }

    if (command === 'skills') {
        const selected = selectSkills(loadSkillSpecs(), positional)
        if (!selected.length) throw new Error('no skill evals found in evals/skills')
        const all: any[] = []

        for (const skill of selected) {
            const { results, elapsed } = await runSkill(skill, overrides(), csv(flags.models))
            for (const item of results) printResult(item.result)
            if (results.length) printCosts(results.map(item => item.result), elapsed)
            for (const item of results) console.log(`saved ${item.file}`)
            all.push(...results)
        }

        if (all.length) announceBundle(buildBundle([], { full: false, only: all.map(item => item.result) }))
        return
    }

    if (command === 'compare') {
        if (positional.length < 2) throw new Error('compare needs at least two refs')
        printCompare(positional.map(loadRef))
        return
    }

    if (command === 'show') {
        const entries = positional.length ? positional.map(loadRef) : listSnapshots().filter(item => !flags.stamp || item.stamps.some(name => name.startsWith(flags.stamp))).map(item => readEntry(item, flags.stamp))
        if (!entries.length) throw new Error('no results to show, run eval:models first')
        const results = entries.map(entry => entry.result)
        for (const result of results) printResult(result)
        printCosts(results, `${results.length} snapshots`)
        return
    }

    if (command === 'bundle') {
        announceBundle(buildBundle(positional, { stamp: flags.stamp, full: flags.full === 'true', out: flags.out, history: flags['no-history'] !== 'true' }))
        return
    }

    if (command === 'report') {
        if (positional[0]) {
            const file = positional[0].replace(/\.json$/, '') + '.html'
            writeFileSync(file, renderHtml(JSON.parse(readFileSync(positional[0], 'utf8'))))
            console.log(`html report: ${file}`)
            return
        }

        announceBundle(buildBundle([], { stamp: flags.stamp, full: false, out: flags.out }))
        return
    }

    if (command === 'list') {
        console.log('models:')
        for (const item of loadSpecs()) console.log(`  ${item.name}  ${item.spec.provider}/${item.spec.model}  snapshots=${(item.spec.snapshots ?? [item.spec.model]).join(',')}  reasoning=${(item.spec.reasoning ?? ['off']).join(',')}`)
        console.log(`modes: ${ALL_MODES.join(', ')} (default: ${DEFAULT_MODES.join(', ')}; add the tools-off mode (tools declared but disabled) only for reference with --with-tools-off)`)
        console.log(`cases: ${CASES.map(item => item.id).join(', ')}`)
        console.log('skills:')
        for (const item of loadSkillSpecs()) console.log(`  ${item.name}  models=${item.spec.models.join(',')}  modes=${(item.spec.modes ?? []).join(',')}  scenarios=${item.spec.scenarios.map(scenario => scenario.id).join(',')}  runs=${item.spec.runs ?? 3}`)
        console.log('results:')
        for (const item of listSnapshots()) console.log(`  ${item.kind === 'skill' ? `skill/${item.skill}/` : ''}${item.provider}/${item.snapshot}  ${item.stamps.join(' ')}`)
        return
    }

    console.log(USAGE)
}

main().catch(error => {
    console.error(String(error?.message ?? error))
    process.exit(1)
})
