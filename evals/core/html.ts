import { readFileSync } from 'fs'
import { join } from 'path'

export function renderHtml (bundle: any) {
    const template = readFileSync(join(__dirname, 'report.template.html'), 'utf8')
    const compact = { ...bundle, results: bundle.results.map((result: any) => ({ ...result, cells: result.cells.map((cell: any) => ({ mode: cell.mode, reasoning: cell.reasoning, strict: cell.strict, summary: cell.summary, byCase: cell.byCase, issues: (cell.issues ?? []).slice(0, 12) })) })) }
    const compact2 = { ...compact, history: (bundle.history ?? []).map((result: any) => ({ ...result, cells: result.cells.map((cell: any) => ({ mode: cell.mode, reasoning: cell.reasoning, strict: cell.strict, summary: cell.summary, byCase: cell.byCase })) })) }
    const data = JSON.stringify(compact2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
    return template.split('/*__DATA__*/null').join(data)
}
