import type { Api, AssistantMessage, Context, Message, Model } from '@earendil-works/pi-ai'
import { reasoningFor } from './catalog'
import { MODES } from './modes'
import type { CaseDef, Kind, ModeDef, RunReport, TurnReport, WorldCtx } from './types'
import { average, formatTime, limiter, usd, userMessage } from './util'

export interface PlanItem {
    mode: ModeDef
    strict: boolean
    level: string
}

export interface Progress {
    done: number
    total: number
    started: number
    cost: number
}

export interface RunConfig {
    runs: number
    cases: CaseDef[]
    callTimeoutMs: number
    concurrency: number
}

export async function runConversation (models: any, model: Model<Api>, item: PlanItem, forced: string, caseDef: CaseDef, callTimeoutMs: number): Promise<RunReport> {
    const ctx: WorldCtx = { calls: [] }
    const built = item.mode.build(caseDef, item.strict, ctx)
    const messages: Message[] = [userMessage(built.opening ?? caseDef.userMessage)]
    const turns: TurnReport[] = []
    const trace: Array<{ tool: string, arguments: any }> = []
    const started = Date.now()
    const sessionId = `eval-${caseDef.id}-${Math.random().toString(36).slice(2, 10)}`
    const maxTurns = caseDef.maxTurns ?? 4
    let answer: string | undefined
    let finalTool: string | undefined

    for (let turn = 1; turn <= maxTurns; turn++) {
        const context: Context = { systemPrompt: built.system, messages, ...(built.tools ? { tools: built.tools } : {}) }
        const reasoning = reasoningFor(model, item.level)
        const toolChoice = built.toolChoice(forced)
        const options: any = { maxRetries: 1, sessionId, signal: AbortSignal.timeout(callTimeoutMs), ...(reasoning ? { reasoning } : {}), ...(toolChoice ? { toolChoice } : {}) }
        const callStarted = Date.now()
        const result: AssistantMessage = await models.completeSimple(model, context, options)
        const ms = Date.now() - callStarted
        const usage: any = result.usage
        const thinkingBlocks = result.content.filter((block: any) => block.type === 'thinking').length

        if (result.stopReason === 'error' || result.stopReason === 'aborted') {
            turns.push({ turn, kind: 'error', calls: [], stopReason: result.stopReason, ms, cost: 0, thinkingBlocks, error: String(result.errorMessage ?? result.stopReason).slice(0, 300) })
            break
        }

        const parsed = built.parse(result)
        const raw = parsed.raw === undefined ? undefined : JSON.stringify(parsed.raw).slice(0, 700)

        turns.push({
            turn,
            kind: parsed.kind,
            calls: parsed.calls,
            stopReason: result.stopReason,
            ms,
            cost: Number(usage?.cost?.total ?? 0),
            inputTokens: usage?.input,
            outputTokens: usage?.output,
            reasoningTokens: usage?.reasoning,
            cacheReadTokens: usage?.cacheRead,
            cacheWriteTokens: usage?.cacheWrite,
            thinkingBlocks,
            ...(parsed.actions.length ? { actions: parsed.actions.map(action => `${action.tool}(${JSON.stringify(action.arguments ?? {}).slice(0, 120)})`) } : {}),
            ...(parsed.recovered ? { recovered: true } : {}),
            ...(parsed.blocks && parsed.blocks > 1 ? { blocks: parsed.blocks } : {}),
            ...(parsed.detail ? { detail: parsed.detail } : {}),
            ...(raw ? { raw } : {}),
        })

        messages.push(result)

        if (parsed.kind === 'complete') {
            for (const action of parsed.actions) if (!built.finalOf(action)) trace.push(action)
            const final = parsed.actions.map(built.finalOf).find(Boolean)
            if (final) {
                answer = final.text
                finalTool = final.tool
                break
            }
        }

        if (parsed.kind === 'empty') break
        messages.push(...built.feedback(result, parsed))
    }

    const total = Date.now() - started
    if (answer === undefined) return { caseId: caseDef.id, turns, correct: false, reason: turns.at(-1)?.error ?? turns.at(-1)?.detail ?? 'no final answer', ms: total }

    const verdict = caseDef.check(answer, trace, finalTool)
    return { caseId: caseDef.id, turns, answer, finalTool, correct: verdict.ok, ...(verdict.reason ? { reason: verdict.reason } : {}), ms: total }
}

export function summarize (runs: RunReport[]) {
    const turns = runs.flatMap(run => run.turns)
    const count = (kind: Kind) => turns.filter(turn => turn.kind === kind).length
    const cost = turns.reduce((sum, turn) => sum + turn.cost, 0)
    const correctRuns = runs.filter(run => run.correct).length
    const callTimes = turns.map(turn => turn.ms)

    return {
        runs: runs.length,
        correctRuns,
        turns: turns.length,
        complete: count('complete'),
        partial: count('reflect-only') + count('action-only'),
        invalid: count('invalid'),
        empty: count('empty'),
        errors: count('error'),
        recovered: turns.filter(turn => turn.recovered).length,
        multiBlock: turns.filter(turn => (turn.blocks ?? 1) > 1).length,
        thinkingTurns: turns.filter(turn => turn.thinkingBlocks > 0 || (turn.reasoningTokens ?? 0) > 0).length,
        avgTurnsPerRun: runs.length ? Number((turns.length / runs.length).toFixed(2)) : 0,
        avgMsPerCall: average(callTimes),
        maxMsPerCall: callTimes.length ? Math.max(...callTimes) : undefined,
        avgMsPerRun: average(runs.map(run => run.ms)),
        inputTokens: turns.reduce((sum, turn) => sum + (turn.inputTokens ?? 0), 0),
        outputTokens: turns.reduce((sum, turn) => sum + (turn.outputTokens ?? 0), 0),
        reasoningTokens: turns.reduce((sum, turn) => sum + (turn.reasoningTokens ?? 0), 0),
        cacheReadTokens: turns.reduce((sum, turn) => sum + (turn.cacheReadTokens ?? 0), 0),
        cacheWriteTokens: turns.reduce((sum, turn) => sum + (turn.cacheWriteTokens ?? 0), 0),
        cost,
        costPerCorrect: correctRuns ? cost / correctRuns : undefined,
    }
}

export async function runCell (models: any, model: Model<Api>, item: PlanItem, forced: string, config: RunConfig) {
    const run = limiter(config.concurrency)
    const jobs = config.cases.flatMap(caseDef => Array.from({ length: config.runs }, () => caseDef))

    const runs = await Promise.all(jobs.map(caseDef => run(() => runConversation(models, model, item, forced, caseDef, config.callTimeoutMs).catch((error: any): RunReport => ({
        caseId: caseDef.id,
        turns: [{ turn: 1, kind: 'error', calls: [], stopReason: 'error', ms: 0, cost: 0, thinkingBlocks: 0, error: String(error?.message ?? error).slice(0, 300) }],
        correct: false,
        reason: String(error?.message ?? error).slice(0, 200),
        ms: 0,
    })))))

    const byCase: Record<string, ReturnType<typeof summarize>> = {}
    for (const caseDef of config.cases) byCase[caseDef.id] = summarize(runs.filter(entry => entry.caseId === caseDef.id))

    return { summary: summarize(runs), byCase, runs }
}

export const cellName = (label: string, item: PlanItem) => `${label} | ${item.mode.id} | reasoning=${item.level} | strict=${item.mode.usesStrict ? (item.strict ? 'on' : 'off') : '-'}`

export function logDone (name: string, summary: ReturnType<typeof summarize>, progress: Progress) {
    progress.done++
    progress.cost += summary.cost
    const elapsed = Date.now() - progress.started
    const eta = (elapsed / progress.done) * (progress.total - progress.done)
    console.error(`[${progress.done}/${progress.total}] done   ${name} | correct ${summary.correctRuns}/${summary.runs} errors ${summary.errors} | ${summary.avgMsPerCall ?? '-'}ms/call cost ${usd(summary.cost)} | elapsed ${formatTime(elapsed)} eta ~${formatTime(eta)} | spent ${usd(progress.cost)}`)
}

export const modeById = (id: string) => MODES[id as keyof typeof MODES]
