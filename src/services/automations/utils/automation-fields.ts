import { AutomationTriggers, readTriggers } from '../entities/trigger'

const MAX_NAME_CHARS = 200
const MAX_INSTRUCTIONS_CHARS = 20000

export interface AutomationFields {
	name?: string
	instructions?: string
	triggers?: AutomationTriggers
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

export function readAutomationFields (payload: Record<string, any> | undefined, options: { complete: boolean, triggers?: AutomationTriggers }): AutomationFields {
	const input = payload ?? {}
	const fields: AutomationFields = {}
	const has = (key: string) => input[key] !== undefined

	if (options.complete || has('name')) fields.name = text(input.name, 'name', MAX_NAME_CHARS)
	if (options.complete || has('instructions')) fields.instructions = text(input.instructions, 'instructions', MAX_INSTRUCTIONS_CHARS)

	if (has('trigger')) throw new Error('The field trigger was replaced by triggers')
	if (has('enabled')) throw new Error('The field enabled belongs to each trigger, send it inside triggers.schedule or triggers.event')
	if (options.complete || has('triggers')) fields.triggers = readTriggers(input.triggers, options.triggers)

	if (has('modelProvider')) fields.modelProvider = optionalText(input.modelProvider, 'model provider')
	if (has('modelName')) fields.modelName = optionalText(input.modelName, 'model name')

	return fields
}

export function assertModel (provider?: string | null, name?: string | null): void {
	if (Boolean(provider) !== Boolean(name)) throw new Error('Set both the model provider and the model name, or neither')
}
