import { Recurrence, validateRecurrence } from './recurrence'
import { assertTimezone } from '../utils/next-run'

export type AutomationTrigger =
	| { type: 'schedule', recurrence: Recurrence, timezone: string }
	| { type: 'event', tokenVersion: number, timezone?: string }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function readTrigger (input: unknown, existing?: AutomationTrigger): AutomationTrigger {
	if (!isRecord(input)) throw new Error('The trigger is required')

	const type = input.type ?? existing?.type
	if (type !== 'schedule' && type !== 'event') throw new Error('The trigger type must be schedule or event')
	if (existing && type !== existing.type) throw new Error('The type of the trigger cannot be changed')

	const previous = existing?.type === type ? existing : undefined
	const has = (key: string) => input[key] !== undefined

	if (type === 'event') {
		const event = previous as Extract<AutomationTrigger, { type: 'event' }> | undefined
		const timezone = has('timezone') ? assertTimezone(input.timezone) : event?.timezone

		return { type, tokenVersion: event?.tokenVersion ?? 1, ...(timezone ? { timezone } : {}) }
	}

	const schedule = previous as Extract<AutomationTrigger, { type: 'schedule' }> | undefined

	return {
		type,
		recurrence: has('recurrence') || !schedule ? validateRecurrence(input.recurrence) : schedule.recurrence,
		timezone: has('timezone') || !schedule ? assertTimezone(input.timezone) : schedule.timezone,
	}
}
