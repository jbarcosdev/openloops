import { Recurrence, validateRecurrence } from './recurrence'
import { assertTimezone } from '../utils/next-run'

export interface ScheduleTrigger {
	enabled: boolean
	recurrence: Recurrence
	timezone: string
	nextRunAt?: string | Date | null
}

export interface EventTrigger {
	enabled: boolean
}

export interface AutomationTriggers {
	schedule?: ScheduleTrigger
	event?: EventTrigger
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const readEnabled = (value: unknown, fallback: boolean): boolean => {
	if (value === undefined) return fallback
	if (typeof value !== 'boolean') throw new Error('The field enabled must be true or false')

	return value
}

function readSchedule (input: unknown, existing?: ScheduleTrigger): ScheduleTrigger {
	if (!isRecord(input)) throw new Error('The schedule trigger must be an object')

	const has = (key: string) => input[key] !== undefined

	return {
		enabled: readEnabled(input.enabled, existing?.enabled ?? true),
		recurrence: has('recurrence') || !existing ? validateRecurrence(input.recurrence) : existing.recurrence,
		timezone: has('timezone') || !existing ? assertTimezone(input.timezone) : existing.timezone,
		...(existing?.nextRunAt ? { nextRunAt: existing.nextRunAt } : {}),
	}
}

function readEvent (input: unknown, existing?: EventTrigger): EventTrigger {
	if (!isRecord(input)) throw new Error('The event trigger must be an object')

	return { enabled: readEnabled(input.enabled, existing?.enabled ?? true) }
}

export function readTriggers (input: unknown, existing: AutomationTriggers = {}): AutomationTriggers {
	if (!isRecord(input)) throw new Error('The triggers are required')
	if (Object.keys(input).some(key => key !== 'schedule' && key !== 'event')) throw new Error('The triggers can only be schedule or event')

	const triggers: AutomationTriggers = { ...existing }

	if (input.schedule === null) delete triggers.schedule
	else if (input.schedule !== undefined) triggers.schedule = readSchedule(input.schedule, existing.schedule)

	if (input.event === null) delete triggers.event
	else if (input.event !== undefined) triggers.event = readEvent(input.event, existing.event)

	if (!triggers.schedule && !triggers.event) throw new Error('The automation needs at least one trigger')

	return triggers
}
