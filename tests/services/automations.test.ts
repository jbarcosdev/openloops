import { ObjectId } from 'mongodb'
import { CreateAutomationUseCase } from '@services/automations/use-cases/create-automation.use-case'
import { UpdateAutomationUseCase } from '@services/automations/use-cases/update-automation.use-case'
import { GetAutomationByIdUseCase } from '@services/automations/use-cases/get-automation-by-id.use-case'
import { ListAutomationsByUserUseCase } from '@services/automations/use-cases/list-automations-by-user.use-case'
import { DeleteAutomationUseCase } from '@services/automations/use-cases/delete-automation.use-case'
import { PreviewAutomationRunsUseCase } from '@services/automations/use-cases/preview-automation-runs.use-case'
import { ListAutomationRunsByAutomationUseCase } from '@services/automations/use-cases/list-automation-runs-by-automation.use-case'
import { ListAutomationRunsByUserUseCase } from '@services/automations/use-cases/list-automation-runs-by-user.use-case'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const OWNER = new ObjectId().toHexString()
const user: any = { userId: OWNER, isAdmin: () => false }
const admin: any = { userId: OWNER, isAdmin: () => true }
const NOW = new Date('2026-10-14T12:00:00Z')

const automations = () => fakeMongo.collection('automations')
const runs = () => fakeMongo.collection('automation_runs')
const stored = () => automations().docs[0]
const nextRunAt = (data: any) => data.triggers.schedule.nextRunAt && new Date(data.triggers.schedule.nextRunAt).toISOString()

const valid = (extra: Record<string, any> = {}) => ({
    name: 'Morning report',
    instructions: 'Summarize my open tickets',
    triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' }, timezone: 'America/Lima' } },
    ...extra,
})

const create = (payload: Record<string, any> = valid(), currentUser = user) =>
    new CreateAutomationUseCase().execute({ payload, currentUser })

const update = (id: string, payload: Record<string, any>, currentUser = user) =>
    new UpdateAutomationUseCase().execute({ id, payload, currentUser })

describe('automations', () => {
    beforeEach(() => {
        fakeMongo.reset()
        jest.useFakeTimers({ now: NOW })
    })

    afterEach(() => jest.useRealTimers())

    describe('creating', () => {
        it('saves the automation as active with the first run calculated in its timezone', async () => {
            const data = await create()

            expect(data).toMatchObject({ name: 'Morning report', triggers: { schedule: { enabled: true, timezone: 'America/Lima' } } })
            expect(data.triggers?.event).toBeUndefined()
            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
            expect(String(stored().ownerId)).toBe(OWNER)
        })

        it('can be created turned off, without a next run', async () => {
            const data = await create(valid({ triggers: { schedule: { enabled: false, recurrence: { type: 'daily', time: '08:00' }, timezone: 'America/Lima' } } }))

            expect(data.triggers?.schedule?.enabled).toBe(false)
            expect(data.triggers?.schedule?.nextRunAt).toBeUndefined()
        })

        it('ignores the fields that only the system sets', async () => {
            const data = await create(valid({ triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' }, timezone: 'America/Lima', nextRunAt: '2020-01-01T00:00:00Z' } }, lockedBy: 'x', lockedUntil: '2099-01-01T00:00:00Z', lastRunStatus: 'completed', activeRunId: new ObjectId().toHexString() }))

            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
            expect(data.lockedBy).toBeUndefined()
            expect(data.lastRunStatus).toBeUndefined()
            expect(data.activeRunId).toBeUndefined()
        })

        it.each([
            [valid({ name: ' ' }), /name is required/],
            [valid({ instructions: undefined }), /instructions is required/],
            [valid({ triggers: { schedule: { recurrence: { type: 'daily', time: '8am' }, timezone: 'UTC' } } }), /HH:mm/],
            [valid({ triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' }, timezone: 'Mars/Olympus' } } }), /not a valid IANA timezone/],
            [valid({ triggers: { schedule: { enabled: 'yes', recurrence: { type: 'daily', time: '08:00' }, timezone: 'UTC' } } }), /true or false/],
            [valid({ triggers: { event: { enabled: 'yes' } } }), /true or false/],
            [valid({ triggers: undefined }), /triggers are required/],
            [valid({ triggers: {} }), /at least one trigger/],
            [valid({ triggers: { schedule: null } }), /at least one trigger/],
            [valid({ triggers: { webhook: {} } }), /can only be schedule or event/],
            [valid({ triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' } } } }), /timezone is required/],
            [valid({ trigger: { type: 'event' } }), /replaced by triggers/],
            [valid({ enabled: false }), /belongs to each trigger/],
            [valid({ modelProvider: 'anthropic' }), /both the model provider and the model name/],
            [valid({ triggers: { schedule: { recurrence: { type: 'once', at: '2026-01-01T10:00' }, timezone: 'UTC' } } }), /already passed/],
        ])('rejects %j', async (payload, message) => {
            await expect(create(payload)).rejects.toThrow(message)
            expect(automations().docs).toHaveLength(0)
        })

        it('needs a user', async () => {
            await expect(new CreateAutomationUseCase().execute({ payload: valid() as any })).rejects.toThrow(/CurrentUser/)
        })

        it('keeps the model chosen for the automation', async () => {
            const data = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            expect(data).toMatchObject({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' })
        })
    })

    describe('updating', () => {
        it('changes the fields and keeps the rest', async () => {
            const automation = await create()
            const data = await update(String(automation._id), { name: 'Evening report', __v: automation.__v })

            expect(data).toMatchObject({ name: 'Evening report', instructions: 'Summarize my open tickets' })
            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
        })

        it('recalculates the next run when the recurrence or the timezone change', async () => {
            const automation = await create()

            const weekly = await update(String(automation._id), { triggers: { schedule: { recurrence: { type: 'weekly', days: [1], time: '09:00' } } } })
            expect(nextRunAt(weekly)).toBe('2026-10-19T14:00:00.000Z')

            const moved = await update(String(automation._id), { triggers: { schedule: { timezone: 'Europe/Madrid' } } })
            expect(nextRunAt(moved)).toBe('2026-10-19T07:00:00.000Z')
        })

        it('turns off without a next run and turns on again counting from now', async () => {
            const automation = await create()
            const id = String(automation._id)

            const off = await update(id, { triggers: { schedule: { enabled: false } } })
            expect(off.triggers?.schedule?.enabled).toBe(false)
            expect(off.triggers?.schedule?.nextRunAt).toBeUndefined()
            expect(stored().triggers.schedule.nextRunAt).toBeUndefined()

            jest.setSystemTime(new Date('2026-10-20T20:00:00Z'))
            const on = await update(id, { triggers: { schedule: { enabled: true } } })

            expect(on.triggers?.schedule?.enabled).toBe(true)
            expect(nextRunAt(on)).toBe('2026-10-21T13:00:00.000Z')
        })

        it('does not let the payload change what the system manages', async () => {
            const automation = await create()
            const id = String(automation._id)
            const claimedAt = new Date('2026-10-14T12:00:00Z')
            Object.assign(stored(), { lockedBy: 'worker-1', lockedUntil: new Date(claimedAt.getTime() + 600000), lastRunStatus: 'failed' })

            const data = await update(id, { name: 'x', triggers: { schedule: { nextRunAt: '2030-01-01T00:00:00Z' } }, lockedBy: 'hacker', lockedUntil: '2000-01-01T00:00:00Z', lastRunStatus: 'completed', ownerId: new ObjectId().toHexString() })

            expect(data).toMatchObject({ lockedBy: 'worker-1', lastRunStatus: 'failed' })
            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
            expect(String(data.ownerId)).toBe(OWNER)
        })

        it('clears the model with an empty value', async () => {
            const automation = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            await update(String(automation._id), { modelProvider: null, modelName: null })

            expect(stored().modelProvider).toBeUndefined()
            expect(stored().modelName).toBeUndefined()
        })

        it('rejects a change that leaves only one of provider and name', async () => {
            const automation = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            await expect(update(String(automation._id), { modelName: null })).rejects.toThrow(/both the model provider and the model name/)
        })

        it('rejects a stale version and a missing automation', async () => {
            const automation = await create()

            await expect(update(String(automation._id), { name: 'x', __v: (automation.__v as number) - 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
            await expect(update(new ObjectId().toHexString(), { name: 'x' })).rejects.toMatchObject({ statusCode: 404 })
            await expect(update(String(automation._id), {})).rejects.toThrow(/Payload is required/)
        })

        it('does not turn on an automation whose single date has passed', async () => {
            const automation = await create(valid({ triggers: { schedule: { recurrence: { type: 'once', at: '2026-10-14T10:00' }, timezone: 'America/Lima' } } }))
            const id = String(automation._id)
            await update(id, { triggers: { schedule: { enabled: false } } })
            jest.setSystemTime(new Date('2026-12-01T00:00:00Z'))

            await expect(update(id, { triggers: { schedule: { enabled: true } } })).rejects.toThrow(/already passed/)
        })

        it('works for an admin as for any user', async () => {
            const automation = await create(valid(), admin)

            const data = await update(String(automation._id), { name: 'x' }, admin)

            expect(data.name).toBe('x')
        })
    })

    describe('with several triggers', () => {
        const schedule = { recurrence: { type: 'daily', time: '08:00' }, timezone: 'America/Lima' }

        it('can have only an event, with no schedule and no next run', async () => {
            const data = await create(valid({ triggers: { event: {} } }))

            expect(data.triggers).toEqual({ event: { enabled: true } })
            expect(data.eventTokenVersion).toBe(1)
        })

        it('can have a schedule and an event at the same time', async () => {
            const data = await create(valid({ triggers: { schedule, event: { enabled: false } } }))

            expect(data.triggers?.event).toEqual({ enabled: false })
            expect(data.triggers?.schedule).toMatchObject({ enabled: true, timezone: 'America/Lima' })
            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
        })

        it('ignores the token version that the payload sends', async () => {
            const data = await create(valid({ triggers: { event: { tokenVersion: 99 } }, eventTokenVersion: 99 }))

            expect(data.triggers?.event).toEqual({ enabled: true })
            expect(data.eventTokenVersion).toBe(1)

            const updated = await update(String(data._id), { eventTokenVersion: 99, triggers: { event: { enabled: false } } })

            expect(updated.eventTokenVersion).toBe(1)
        })

        it('adds an event to a schedule without moving the next run', async () => {
            const automation = await create()
            jest.setSystemTime(new Date('2026-10-14T12:30:00Z'))

            const data = await update(String(automation._id), { triggers: { event: {} } })

            expect(data.triggers?.event).toEqual({ enabled: true })
            expect(data.eventTokenVersion).toBe(1)
            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
        })

        it('turns the event off and on keeping its token version', async () => {
            const automation = await create(valid({ triggers: { schedule, event: {} } }))
            const id = String(automation._id)
            stored().eventTokenVersion = 4

            const off = await update(id, { triggers: { event: { enabled: false } } })
            expect(off.triggers?.event).toEqual({ enabled: false })
            expect(off.eventTokenVersion).toBe(4)
            expect(off.triggers?.schedule?.enabled).toBe(true)

            const on = await update(id, { triggers: { event: { enabled: true } } })
            expect(on.triggers?.event).toEqual({ enabled: true })
            expect(on.eventTokenVersion).toBe(4)
        })

        it('turns the schedule off without touching the event', async () => {
            const automation = await create(valid({ triggers: { schedule, event: {} } }))

            const data = await update(String(automation._id), { triggers: { schedule: { enabled: false } } })

            expect(data.triggers?.schedule?.enabled).toBe(false)
            expect(data.triggers?.schedule?.nextRunAt).toBeUndefined()
            expect(data.triggers?.event?.enabled).toBe(true)
        })

        it('removes the schedule with null and its next run goes with it', async () => {
            const automation = await create(valid({ triggers: { schedule, event: {} } }))

            await update(String(automation._id), { triggers: { schedule: null } })

            expect(stored().triggers).toEqual({ event: { enabled: true } })
            expect(stored().eventTokenVersion).toBe(1)
        })

        it('removes the event with null, keeps the schedule and counts it as a rotation of the tokens', async () => {
            const automation = await create(valid({ triggers: { schedule, event: {} } }))

            await update(String(automation._id), { triggers: { event: null } })

            expect(stored().eventTokenVersion).toBe(2)

            expect(stored().triggers.event).toBeUndefined()
            expect(stored().triggers.schedule.enabled).toBe(true)
            expect(new Date(stored().triggers.schedule.nextRunAt).toISOString()).toBe('2026-10-14T13:00:00.000Z')
        })

        it('does not let the last trigger be removed', async () => {
            const automation = await create()

            await expect(update(String(automation._id), { triggers: { schedule: null } })).rejects.toThrow(/at least one trigger/)
            expect(stored().triggers.schedule).toBeDefined()
        })

        it('needs a recurrence and a timezone to add a schedule', async () => {
            const automation = await create(valid({ triggers: { event: {} } }))

            await expect(update(String(automation._id), { triggers: { schedule: { enabled: true } } })).rejects.toThrow(/recurrence is required/)

            const data = await update(String(automation._id), { triggers: { schedule } })
            expect(nextRunAt(data)).toBe('2026-10-14T13:00:00.000Z')
        })

        it('rejects the fields of the previous shape', async () => {
            const automation = await create()

            await expect(update(String(automation._id), { trigger: { type: 'schedule' } })).rejects.toThrow(/replaced by triggers/)
            await expect(update(String(automation._id), { enabled: false })).rejects.toThrow(/belongs to each trigger/)
        })
    })

    describe('reading', () => {
        it('gets one automation and returns null when there is none', async () => {
            const automation = await create()
            const get = new GetAutomationByIdUseCase()

            expect((await get.execute({ id: String(automation._id), currentUser: user }))?.name).toBe('Morning report')
            expect((await get.execute({ id: new ObjectId().toHexString(), currentUser: user }))).toBeNull()
        })

        it('lists the automations of the user, newest first, with pagination', async () => {
            for (const name of ['a', 'b', 'c']) {
                jest.setSystemTime(new Date(NOW.getTime() + ['a', 'b', 'c'].indexOf(name) * 1000))
                await create(valid({ name }))
            }
            await create(valid({ name: 'someone else' }), { userId: new ObjectId().toHexString(), isAdmin: () => false })

            const list = new ListAutomationsByUserUseCase()
            const first = await list.execute({ currentUser: user, options: { page: 1, limit: 2 } })
            const second = await list.execute({ currentUser: user, options: { page: 2, limit: 2 } })

            expect(first.items.map(automation => automation.name)).toEqual(['c', 'b'])
            expect(second.items.map(automation => automation.name)).toEqual(['a'])
        })
    })

    describe('deleting', () => {
        it('removes it from the lists and from what the worker takes', async () => {
            const automation = await create()
            const remove = new DeleteAutomationUseCase()

            await remove.execute({ id: String(automation._id), currentUser: user })

            expect(stored().deletedAt).toBeInstanceOf(Date)
            expect(stored().triggers.schedule.nextRunAt).toBeUndefined()
            expect((await new ListAutomationsByUserUseCase().execute({ currentUser: user })).items).toHaveLength(0)
        })

        it('only lets an admin delete it for good', async () => {
            const automation = await create()
            const remove = new DeleteAutomationUseCase()

            await expect(remove.execute({ id: String(automation._id), hardDelete: true, currentUser: user })).rejects.toBeDefined()
            expect(automations().docs).toHaveLength(1)

            await remove.execute({ id: String(automation._id), hardDelete: true, currentUser: admin })
            expect(automations().docs).toHaveLength(0)
        })
    })

    describe('previewing', () => {
        it('lists the next runs of a recurrence without saving anything', async () => {
            const data = await new PreviewAutomationRunsUseCase().execute({ recurrence: { type: 'weekly', days: [1, 5], time: '08:00' }, timezone: 'UTC', count: 3 })

            expect(data.runs.map(date => date.toISOString())).toEqual(['2026-10-16T08:00:00.000Z', '2026-10-19T08:00:00.000Z', '2026-10-23T08:00:00.000Z'])
            expect(automations().docs).toHaveLength(0)
        })

        it('validates what it receives', async () => {
            const preview = new PreviewAutomationRunsUseCase()

            await expect(preview.execute({ recurrence: { type: 'daily', time: 'x' }, timezone: 'UTC' })).rejects.toThrow(/HH:mm/)
            await expect(preview.execute({ recurrence: { type: 'daily', time: '08:00' }, timezone: 'Nope/Nope' })).rejects.toThrow(/IANA/)
        })
    })

    describe('listing runs', () => {
        const seed = async () => {
            const automationId = new ObjectId()
            const otherJob = new ObjectId()
            const owner = new ObjectId(OWNER)
            const rows: [ObjectId, string, number][] = [[automationId, 'completed', 1], [automationId, 'failed', 2], [otherJob, 'paused', 3]]

            for (const [automation, status, offset] of rows) {
                await runs().insertOne({ automationId: automation, ownerId: owner, status, trigger: 'schedule', createdAt: new Date(NOW.getTime() + offset * 1000), __v: 1 })
            }
            await runs().insertOne({ automationId: new ObjectId(), ownerId: new ObjectId(), status: 'completed', createdAt: NOW, __v: 1 })

            return { automationId }
        }

        it('lists the runs of an automation, newest first', async () => {
            const { automationId } = await seed()
            const { items: data } = await new ListAutomationRunsByAutomationUseCase().execute({ automationId: String(automationId), currentUser: user })

            expect(data.map(run => run.status)).toEqual(['failed', 'completed'])
        })

        it('lists the runs of a user and can filter by status', async () => {
            await seed()
            const list = new ListAutomationRunsByUserUseCase()

            expect((await list.execute({ currentUser: user })).items.map(run => run.status)).toEqual(['paused', 'failed', 'completed'])
            expect((await list.execute({ currentUser: user, status: 'paused' })).items).toHaveLength(1)
        })

        it('needs a user and an automation', async () => {
            await expect(new ListAutomationRunsByUserUseCase().execute({})).rejects.toThrow(/CurrentUser/)
            await expect(new ListAutomationRunsByAutomationUseCase().execute({ automationId: '' })).rejects.toThrow(/automationId/)
        })
    })
})
