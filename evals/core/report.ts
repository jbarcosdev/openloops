import { seconds, usd } from './util'

const percent = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : '-'

export function printResult (result: any) {
    console.log(`\n=== ${result.kind === 'skill' ? `skill ${result.skill}@${result.skillVersion ?? '?'} | ` : ''}${result.provider}/${result.snapshot} (${result.api}) | pi-ai ${result.piAiVersion} | ${result.config.runs} runs x ${result.config.cases.length} cases | price ${result.pricing?.input ?? '-'}/${result.pricing?.output ?? '-'} per 1M`)
    for (const note of result.skipped) console.log(`skipped ${note}`)

    console.table(result.cells.map((cell: any) => {
        const summary = cell.summary
        return {
            mode: cell.mode,
            reasoning: cell.reasoning,
            strict: cell.strict,
            correct: `${summary.correctRuns}/${summary.runs} (${percent(summary.correctRuns, summary.runs)})`,
            validTurns: `${summary.complete}/${summary.turns}`,
            errors: summary.errors,
            turnsPerRun: summary.avgTurnsPerRun,
            msPerCall: summary.avgMsPerCall ?? '-',
            maxMs: summary.maxMsPerCall ?? '-',
            secPerRun: seconds(summary.avgMsPerRun),
            cost: usd(summary.cost),
            perCorrect: summary.costPerCorrect === undefined ? '-' : usd(summary.costPerCorrect),
        }
    }))

    const caseIds = result.config.cases as string[]
    console.table(result.cells.map((cell: any) => ({
        cell: `${cell.mode}/${cell.reasoning}/${cell.strict}`,
        ...Object.fromEntries(caseIds.map(id => [id, `${cell.byCase[id].correctRuns}/${cell.byCase[id].runs}`])),
    })))

    for (const cell of result.cells) {
        const issues = new Map<string, number>()

        for (const run of cell.runs) {
            if (!run.correct && run.reason) issues.set(`${run.caseId}: ${run.reason}`.slice(0, 170), (issues.get(`${run.caseId}: ${run.reason}`.slice(0, 170)) ?? 0) + 1)
            for (const turn of run.turns) {
                const issue = turn.error ?? turn.detail
                if (issue) issues.set(issue.slice(0, 170), (issues.get(issue.slice(0, 170)) ?? 0) + 1)
            }
        }

        for (const [issue, total] of [...issues].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${cell.mode}/${cell.reasoning}/${cell.strict}: ${issue} (x${total})`)
    }
}

export function printCosts (results: any[], elapsedLabel?: string) {
    console.log('\n=== costs (estimated with the pi-ai catalog prices)')
    const rows = results.map(result => ({
        model: `${result.provider}/${result.snapshot}`,
        conversations: result.totals.runs,
        calls: result.totals.calls,
        inputTokens: result.totals.inputTokens,
        outputTokens: result.totals.outputTokens,
        reasoningTokens: result.totals.reasoningTokens,
        cost: usd(result.totals.cost),
    }))
    const total = results.reduce((sum, result) => sum + result.totals.cost, 0)
    console.table([...rows, { model: 'TOTAL', conversations: results.reduce((sum, result) => sum + result.totals.runs, 0), calls: results.reduce((sum, result) => sum + result.totals.calls, 0), inputTokens: '', outputTokens: '', reasoningTokens: '', cost: usd(total) }])
    if (elapsedLabel) console.log(`elapsed ${elapsedLabel}`)
}

export function printCompare (entries: Array<{ label: string, result: any }>) {
    const versions = [...new Set(entries.map(entry => entry.result.casesVersion ?? 1))]
    if (versions.length > 1) console.log(`WARNING: these results were produced with different case versions (${versions.join(', ')}), so the scores are not directly comparable`)

    const keys: string[] = []
    for (const entry of entries) for (const cell of entry.result.cells) {
        const key = `${cell.mode}/${cell.reasoning}/${cell.strict}`
        if (!keys.includes(key)) keys.push(key)
    }

    const cellOf = (entry: { result: any }, key: string) => entry.result.cells.find((cell: any) => `${cell.mode}/${cell.reasoning}/${cell.strict}` === key)

    console.table(keys.map(key => ({
        cell: key,
        ...Object.fromEntries(entries.map(entry => {
            const cell = cellOf(entry, key)
            if (!cell) return [entry.label, '-']
            const summary = cell.summary
            return [entry.label, `${summary.correctRuns}/${summary.runs} ${summary.avgMsPerCall ?? '-'}ms ${usd(summary.cost)}`]
        })),
    })))

    console.table(entries.map(entry => ({
        ref: entry.label,
        api: entry.result.api,
        pricePer1M: `${entry.result.pricing?.input ?? '-'}/${entry.result.pricing?.output ?? '-'}`,
        correct: `${entry.result.totals.correctRuns}/${entry.result.totals.runs}`,
        cost: usd(entry.result.totals.cost),
        piAi: entry.result.piAiVersion,
    })))
}
