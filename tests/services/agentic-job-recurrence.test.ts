import { validateRecurrence, toCronPattern } from '@services/agentic-jobs/entities/recurrence'
import { computeNextRun, previewNextRuns, assertTimezone } from '@services/agentic-jobs/utils/next-run'

const iso = (date: Date | null) => date?.toISOString() ?? null

describe('validating a recurrence', () => {
    it('accepts every type', () => {
        expect(validateRecurrence({ type: 'daily', time: '08:00' })).toEqual({ type: 'daily', time: '08:00' })
        expect(validateRecurrence({ type: 'weekly', days: [5, 1, 1, 3], time: '23:59' })).toEqual({ type: 'weekly', days: [1, 3, 5], time: '23:59' })
        expect(validateRecurrence({ type: 'monthly', day: 31, time: '00:00' })).toEqual({ type: 'monthly', day: 31, time: '00:00' })
        expect(validateRecurrence({ type: 'monthly', day: 'last', time: '10:30' })).toEqual({ type: 'monthly', day: 'last', time: '10:30' })
        expect(validateRecurrence({ type: 'once', at: '2026-12-25T10:00' })).toEqual({ type: 'once', at: '2026-12-25T10:00' })
    })

    it.each([
        [undefined, /required/],
        [{ type: 'hourly', time: '08:00' }, /must be daily, weekly, monthly or once/],
        [{ type: 'daily', time: '8:00' }, /HH:mm/],
        [{ type: 'daily', time: '24:00' }, /HH:mm/],
        [{ type: 'daily', time: '08:60' }, /HH:mm/],
        [{ type: 'weekly', days: [], time: '08:00' }, /days of a weekly/],
        [{ type: 'weekly', days: [0], time: '08:00' }, /days of a weekly/],
        [{ type: 'weekly', days: [8], time: '08:00' }, /days of a weekly/],
        [{ type: 'weekly', days: 'mon', time: '08:00' }, /days of a weekly/],
        [{ type: 'monthly', day: 0, time: '08:00' }, /day of a monthly/],
        [{ type: 'monthly', day: 32, time: '08:00' }, /day of a monthly/],
        [{ type: 'monthly', day: 'first', time: '08:00' }, /day of a monthly/],
        [{ type: 'once', at: '2026-12-25 10:00' }, /YYYY-MM-DDTHH:mm/],
        [{ type: 'once', at: '2026-02-30T10:00' }, /does not exist/],
    ])('rejects %j', (value, message) => {
        expect(() => validateRecurrence(value)).toThrow(message)
    })

    it('rejects an unknown timezone', () => {
        expect(assertTimezone('America/Lima')).toBe('America/Lima')
        expect(() => assertTimezone('Mars/Olympus')).toThrow(/not a valid IANA timezone/)
        expect(() => assertTimezone('')).toThrow(/required/)
    })
})

describe('translating a recurrence to a pattern', () => {
    it('writes the pattern of each type', () => {
        expect(toCronPattern({ type: 'daily', time: '08:05' })).toBe('5 8 * * *')
        expect(toCronPattern({ type: 'weekly', days: [1, 2, 3, 4, 5], time: '09:30' })).toBe('30 9 * * MON,TUE,WED,THU,FRI')
        expect(toCronPattern({ type: 'weekly', days: [7], time: '18:00' })).toBe('0 18 * * SUN')
        expect(toCronPattern({ type: 'monthly', day: 15, time: '12:00' })).toBe('0 12 15 * *')
        expect(toCronPattern({ type: 'monthly', day: 'last', time: '12:00' })).toBe('0 12 L * *')
        expect(toCronPattern({ type: 'once', at: '2026-12-25T10:00' })).toBeUndefined()
    })
})

describe('computing the next run', () => {
    it('uses the local time of the timezone', () => {
        expect(iso(computeNextRun({ type: 'daily', time: '08:00' }, 'America/Lima', new Date('2026-10-14T12:00:00Z')))).toBe('2026-10-14T13:00:00.000Z')
        expect(iso(computeNextRun({ type: 'daily', time: '08:00' }, 'America/Lima', new Date('2026-10-14T13:00:00Z')))).toBe('2026-10-15T13:00:00.000Z')
    })

    it('never returns the moment it is asked from', () => {
        const from = new Date('2026-10-14T13:00:00Z')
        const next = computeNextRun({ type: 'daily', time: '08:00' }, 'America/Lima', from)!

        expect(next.getTime()).toBeGreaterThan(from.getTime())
    })

    it('runs from Monday to Friday and skips the weekend', () => {
        const recurrence = { type: 'weekly' as const, days: [1, 2, 3, 4, 5], time: '09:30' }

        expect(iso(computeNextRun(recurrence, 'Europe/Madrid', new Date('2026-10-16T10:00:00Z')))).toBe('2026-10-19T07:30:00.000Z')
    })

    it('runs on Sunday', () => {
        expect(iso(computeNextRun({ type: 'weekly', days: [7], time: '18:00' }, 'UTC', new Date('2026-10-14T00:00:00Z')))).toBe('2026-10-18T18:00:00.000Z')
    })

    it('omits the months that do not have the day', () => {
        const recurrence = { type: 'monthly' as const, day: 31, time: '08:00' }

        expect(previewNextRuns(recurrence, 'UTC', 4, new Date('2026-10-01T00:00:00Z')).map(iso)).toEqual([
            '2026-10-31T08:00:00.000Z',
            '2026-12-31T08:00:00.000Z',
            '2027-01-31T08:00:00.000Z',
            '2027-03-31T08:00:00.000Z',
        ])
    })

    it('finds the last day of every month', () => {
        const recurrence = { type: 'monthly' as const, day: 'last' as const, time: '08:00' }

        expect(previewNextRuns(recurrence, 'UTC', 3, new Date('2027-01-15T00:00:00Z')).map(iso)).toEqual([
            '2027-01-31T08:00:00.000Z',
            '2027-02-28T08:00:00.000Z',
            '2027-03-31T08:00:00.000Z',
        ])
    })

    it('runs a recurrence of type once only while its date is ahead', () => {
        const recurrence = { type: 'once' as const, at: '2026-12-25T10:00' }

        expect(iso(computeNextRun(recurrence, 'America/Lima', new Date('2026-10-14T00:00:00Z')))).toBe('2026-12-25T15:00:00.000Z')
        expect(computeNextRun(recurrence, 'America/Lima', new Date('2026-12-25T15:00:00Z'))).toBeNull()
        expect(computeNextRun(recurrence, 'America/Lima', new Date('2027-01-01T00:00:00Z'))).toBeNull()
    })

    describe('daylight saving time', () => {
        it('keeps the local hour when the clocks change', () => {
            const next = (from: string) => iso(computeNextRun({ type: 'daily', time: '08:00' }, 'America/New_York', new Date(from)))

            expect(next('2026-03-07T14:00:00Z')).toBe('2026-03-08T12:00:00.000Z')
            expect(next('2026-03-08T12:00:00Z')).toBe('2026-03-09T12:00:00.000Z')
            expect(next('2026-10-31T14:00:00Z')).toBe('2026-11-01T13:00:00.000Z')
        })

        it('moves a time that does not exist to the first valid moment, once', () => {
            const recurrence = { type: 'daily' as const, time: '02:30' }
            const runs = previewNextRuns(recurrence, 'America/New_York', 3, new Date('2026-03-07T12:00:00Z'))

            expect(runs.map(iso)).toEqual(['2026-03-08T07:00:00.000Z', '2026-03-09T06:30:00.000Z', '2026-03-10T06:30:00.000Z'])
        })

        it('runs once a day when a local hour happens twice', () => {
            const recurrence = { type: 'daily' as const, time: '01:30' }
            const runs = previewNextRuns(recurrence, 'America/New_York', 4, new Date('2026-10-30T12:00:00Z'))

            expect(runs.map(iso)).toEqual(['2026-10-31T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z', '2026-11-03T06:30:00.000Z'])
        })

        it('does not return a past moment when asked from the repeated hour', () => {
            const recurrence = { type: 'daily' as const, time: '01:30' }
            const from = new Date('2026-11-01T06:00:00Z')
            const next = computeNextRun(recurrence, 'America/New_York', from)!

            expect(next.getTime()).toBeGreaterThan(from.getTime())
            expect(iso(next)).toBe('2026-11-02T06:30:00.000Z')
        })
    })
})

describe('previewing the next runs', () => {
    it('returns the requested number, capped at twenty', () => {
        const recurrence = { type: 'daily' as const, time: '08:00' }

        expect(previewNextRuns(recurrence, 'UTC', 3, new Date('2026-10-14T00:00:00Z'))).toHaveLength(3)
        expect(previewNextRuns(recurrence, 'UTC', 500, new Date('2026-10-14T00:00:00Z'))).toHaveLength(20)
        expect(previewNextRuns(recurrence, 'UTC', 0)).toEqual([])
    })

    it('returns fewer when a recurrence ends', () => {
        const recurrence = { type: 'once' as const, at: '2026-12-25T10:00' }

        expect(previewNextRuns(recurrence, 'UTC', 5, new Date('2026-10-14T00:00:00Z'))).toHaveLength(1)
    })
})
