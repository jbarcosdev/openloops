import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { safeName, stamp } from './util'

export const RESULTS_DIR = join(__dirname, '..', 'results')

export interface SnapshotEntry {
    kind: 'model' | 'skill'
    skill?: string
    provider: string
    snapshot: string
    directory: string
    stamps: string[]
}

export function writeResult (result: any) {
    const base = result.kind === 'skill' ? join(RESULTS_DIR, 'skills', safeName(result.skill)) : join(RESULTS_DIR, 'models')
    const directory = join(base, safeName(result.provider), safeName(result.snapshot))
    mkdirSync(directory, { recursive: true })
    const file = join(directory, `${stamp(new Date(result.startedAt))}.json`)
    writeFileSync(file, JSON.stringify(result, null, 2))
    copyFileSync(file, join(directory, 'latest.json'))
    return file
}

const subdirectories = (directory: string) => existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : []

function collect (root: string, kind: 'model' | 'skill', skill?: string) {
    const found: SnapshotEntry[] = []

    for (const provider of subdirectories(root)) {
        for (const snapshot of subdirectories(join(root, provider))) {
            const directory = join(root, provider, snapshot)
            const stamps = readdirSync(directory).filter(name => name.endsWith('.json') && name !== 'latest.json').map(name => name.slice(0, -5)).sort()
            found.push({ kind, ...(skill ? { skill } : {}), provider, snapshot, directory, stamps })
        }
    }

    return found
}

export function listSnapshots (): SnapshotEntry[] {
    const skillsRoot = join(RESULTS_DIR, 'skills')
    return [...collect(join(RESULTS_DIR, 'models'), 'model'), ...subdirectories(skillsRoot).flatMap(skill => collect(join(skillsRoot, skill), 'skill', skill))]
}

export function readEntry (entry: SnapshotEntry, version?: string) {
    const stampName = version ? entry.stamps.find(name => name.startsWith(version)) : 'latest'
    if (!stampName) throw new Error(`no result for ${entry.snapshot}@${version}, available: ${entry.stamps.join(', ')}`)
    const result = JSON.parse(readFileSync(join(entry.directory, `${stampName}.json`), 'utf8'))
    for (const cell of result.cells ?? []) if (cell.mode === 'current') cell.mode = 'tools-off'
    if (Array.isArray(result.config?.modes)) result.config.modes = result.config.modes.map((mode: string) => mode === 'current' ? 'tools-off' : mode)
    const label = `${entry.skill ? `${entry.skill}:` : ''}${entry.snapshot}@${stamp(new Date(result.startedAt))}`
    return { label, result }
}

export function loadRef (ref: string) {
    if (ref.endsWith('.json') && existsSync(ref)) return { label: ref, result: JSON.parse(readFileSync(ref, 'utf8')) }

    const [target, version] = ref.split('@')
    const isSkill = target.startsWith('skill/')
    const [skill, ...path] = isSkill ? target.slice(6).split('/') : [undefined, ...target.split('/')]
    const [provider, snapshotName] = path.length > 1 ? [path[0], path.slice(1).join('/')] : [undefined, path[0]]
    const snapshot = safeName(String(snapshotName))
    const matches = listSnapshots().filter(item => (isSkill ? item.skill === skill : item.kind === 'model') && item.snapshot === snapshot && (!provider || item.provider === safeName(provider)))

    if (!matches.length) throw new Error(`no results found for "${ref}"`)
    if (matches.length > 1) throw new Error(`"${target}" matches several providers (${matches.map(item => item.provider).join(', ')}), use provider/snapshot`)

    return readEntry(matches[0], version)
}
