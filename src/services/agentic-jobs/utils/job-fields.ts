import { Recurrence, validateRecurrence } from '../entities/recurrence'
import { assertTimezone } from './next-run'

const MAX_NAME_CHARS = 200
const MAX_INSTRUCTIONS_CHARS = 20000

export interface JobFields {
	name?: string
	instructions?: string
	enabled?: boolean
	recurrence?: Recurrence
	timezone?: string
	modelProvider?: string | null
	modelName?: string | null
}

const text = (value: unknown, label: string, max: number): string => {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`The ${label} is required`)
	if (value.length > max) throw new Error(`The ${label} cannot be longer than ${max} characters`)

	return value.trim()
}

const optionalText = (value: unknown, label: string): string | null => {
	if (value === null || value === '') return null
	return text(value, label, MAX_NAME_CHARS)
}

export function readJobFields (payload: Record<string, any> | undefined, options: { complete: boolean }): JobFields {
	const input = payload ?? {}
	const fields: JobFields = {}
	const has = (key: string) => input[key] !== undefined

	if (options.complete || has('name')) fields.name = text(input.name, 'name', MAX_NAME_CHARS)
	if (options.complete || has('instructions')) fields.instructions = text(input.instructions, 'instructions', MAX_INSTRUCTIONS_CHARS)
	if (options.complete || has('recurrence')) fields.recurrence = validateRecurrence(input.recurrence)
	if (options.complete || has('timezone')) fields.timezone = assertTimezone(input.timezone)

	if (has('enabled')) {
		if (typeof input.enabled !== 'boolean') throw new Error('The field enabled must be true or false')
		fields.enabled = input.enabled
	}

	if (has('modelProvider')) fields.modelProvider = optionalText(input.modelProvider, 'model provider')
	if (has('modelName')) fields.modelName = optionalText(input.modelName, 'model name')

	return fields
}

export function assertModel (provider?: string | null, name?: string | null): void {
	if (Boolean(provider) !== Boolean(name)) throw new Error('Set both the model provider and the model name, or neither')
}
