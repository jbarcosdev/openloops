export const MAX_PERIODS = 366

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

interface PeriodConfig {
	format: string
	first: (day: string) => string
	next: (label: string) => string
}

export const addDays = (day: string, amount: number): string =>
	new Date(Date.parse(`${day}T00:00:00Z`) + amount * MS_PER_DAY).toISOString().slice(0, 10)

const addMonths = (month: string, amount: number): string => {
	const [year, monthNumber] = month.split('-').map(Number)
	return new Date(Date.UTC(year, monthNumber - 1 + amount, 1)).toISOString().slice(0, 7)
}

const isValidDay = (value: string): boolean => {
	if (!DAY_FORMAT.test(value)) return false
	const parsed = new Date(`${value}T00:00:00Z`)
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const PERIODS = {
	day: { format: '%Y-%m-%d', first: day => day, next: label => addDays(label, 1) },
	month: { format: '%Y-%m', first: day => day.slice(0, 7), next: label => addMonths(label, 1) },
} satisfies Record<string, PeriodConfig>

export type UsagePeriod = keyof typeof PERIODS

export const resolveTimezone = (ianaIdentifier?: string): string => {
	if (!ianaIdentifier) return 'UTC'

	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: ianaIdentifier })
		return ianaIdentifier
	} catch {
		return 'UTC'
	}
}

export const todayIn = (timezone: string, now: Date = new Date()): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

export const resolveRange = (input: { fromDate?: string, toDate?: string }, timezone: string, now: Date = new Date()): { from: string, to: string } => {
	const month = todayIn(timezone, now).slice(0, 7)
	const from = input.fromDate ?? `${month}-01`
	const to = input.toDate ?? addDays(`${addMonths(month, 1)}-01`, -1)

	for (const value of [from, to]) {
		if (!isValidDay(value)) throw new Error(`Invalid date "${value}", use the format YYYY-MM-DD`)
	}

	if (from > to) throw new Error('fromDate must not be later than toDate')

	return { from, to }
}

export const enumeratePeriods = (groupBy: UsagePeriod, from: string, to: string): string[] => {
	const period: PeriodConfig | undefined = PERIODS[groupBy]
	if (!period) throw new Error(`Invalid groupBy "${groupBy}". Use one of: ${Object.keys(PERIODS).join(', ')}`)

	const last = period.first(to)
	const labels: string[] = []

	for (let label = period.first(from); label <= last; label = period.next(label)) {
		labels.push(label)
		if (labels.length > MAX_PERIODS) throw new Error(`The range has more than ${MAX_PERIODS} periods, use a shorter range or a larger groupBy`)
	}

	return labels
}
