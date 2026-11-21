export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

export enum IntervalUnit {
    MINUTES = 'minutes',
    HOURS = 'hours',
}

export const MIN_INTERVAL_MINUTES = 5

export const intervalToMinutes = (every: number, unit: IntervalUnit): number => unit === IntervalUnit.HOURS ? every * 60 : every

export type Recurrence =
    | { type: 'daily', time: string }
    | { type: 'weekly', days: number[], time: string }
    | { type: 'monthly', day: number | 'last', time: string }
    | { type: 'interval', every: number, unit: IntervalUnit, start: string }
    | { type: 'once', at: string }

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const assertTime = (value: unknown): string => {
    if (typeof value !== 'string' || !TIME.test(value)) throw new Error('The time must be written as HH:mm, in 24 hours')
    return value
}

const assertLocalDateTime = (value: unknown, type: string): string => {
    const match = typeof value === 'string' ? LOCAL_DATE_TIME.exec(value) : null
    if (!match) throw new Error(`The date of a recurrence of type ${type} must be written as YYYY-MM-DDTHH:mm`)

    const [, year, month, day] = match
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) {
        throw new Error(`The date of a recurrence of type ${type} does not exist`)
    }

    return value as string
}

export function validateRecurrence (value: unknown): Recurrence {
    if (!isRecord(value)) throw new Error('The recurrence is required')

    switch (value.type) {
        case 'daily':
            return { type: 'daily', time: assertTime(value.time) }

        case 'weekly': {
            const days = value.days
            const valid = Array.isArray(days) && days.length > 0 && days.every(day => Number.isInteger(day) && day >= 1 && day <= 7)
            if (!valid) throw new Error('The days of a weekly recurrence must be a list of numbers from 1 (Monday) to 7 (Sunday)')

            return { type: 'weekly', days: Array.from(new Set(days as number[])).sort((a, b) => a - b), time: assertTime(value.time) }
        }

        case 'monthly': {
            const day = value.day
            const valid = day === 'last' || (Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 31)
            if (!valid) throw new Error('The day of a monthly recurrence must be a number from 1 to 31 or "last"')

            return { type: 'monthly', day: day as number | 'last', time: assertTime(value.time) }
        }

        case 'interval': {
            const { every, unit } = value
            if (!Number.isInteger(every) || (every as number) < 1) throw new Error('The interval of a recurrence must be a whole number greater than zero')
            if (!Object.values(IntervalUnit).includes(unit as IntervalUnit)) throw new Error('The unit of an interval must be minutes or hours')
            if (intervalToMinutes(every as number, unit as IntervalUnit) < MIN_INTERVAL_MINUTES) throw new Error(`The interval of a recurrence cannot be shorter than ${MIN_INTERVAL_MINUTES} minutes`)

            return { type: 'interval', every: every as number, unit: unit as IntervalUnit, start: assertLocalDateTime(value.start, 'interval') }
        }

        case 'once':
            return { type: 'once', at: assertLocalDateTime(value.at, 'once') }

        default:
            throw new Error('The type of the recurrence must be daily, weekly, monthly, interval or once')
    }
}

export function toCronPattern (recurrence: Recurrence): string | undefined {
    if (recurrence.type === 'once' || recurrence.type === 'interval') return undefined

    const [hour, minute] = recurrence.time.split(':').map(Number)

    switch (recurrence.type) {
        case 'daily':
            return `${minute} ${hour} * * *`
        case 'weekly':
            return `${minute} ${hour} * * ${recurrence.days.map(day => WEEKDAYS[day - 1]).join(',')}`
        case 'monthly':
            return `${minute} ${hour} ${recurrence.day === 'last' ? 'L' : recurrence.day} * *`
    }
}
