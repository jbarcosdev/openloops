import 'reflect-metadata'
import { container } from 'tsyringe'
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

const valid = (extra: Record<string, any> = {}) => ({
    name: 'Morning report',
    instructions: 'Summarize my open tickets',
    trigger: { type: 'schedule', recurrence: { type: 'daily', time: '08:00' }, timezone: 'America/Lima' },
    ...extra,
})

const create = (payload: Record<string, any> = valid(), currentUser = user) =>
    container.resolve(CreateAutomationUseCase).execute({ payload, currentUser })

const update = (id: string, payload: Record<string, any>, currentUser = user) =>
    container.resolve(UpdateAutomationUseCase).execute({ id, payload, currentUser })

describe('automations', () => {
    beforeEach(() => {
        fakeMongo.reset()
        jest.useFakeTimers({ now: NOW })
    })

    afterEach(() => jest.useRealTimers())

    describe('creating', () => {
        it('saves the automation as active with the first run calculated in its timezone', async () => {
            const { data } = await create()

            expect(data).toMatchObject({ name: 'Morning report', enabled: true, trigger: { timezone: 'America/Lima' } })
            expect(new Date(data.nextRunAt as Date).toISOString()).toBe('2026-10-14T13:00:00.000Z')
            expect(String(stored().ownerId)).toBe(OWNER)
        })

        it('can be created turned off, without a next run', async () => {
            const { data } = await create(valid({ enabled: false }))

            expect(data.enabled).toBe(false)
            expect(data.nextRunAt).toBeUndefined()
        })

        it('ignores the fields that only the system sets', async () => {
            const { data } = await create(valid({ nextRunAt: '2020-01-01T00:00:00Z', lockedBy: 'x', lockedUntil: '2099-01-01T00:00:00Z', lastRunStatus: 'completed', activeRunId: new ObjectId().toHexString() }))

            expect(new Date(data.nextRunAt as Date).toISOString()).toBe('2026-10-14T13:00:00.000Z')
            expect(data.lockedBy).toBeUndefined()
            expect(data.lastRunStatus).toBeUndefined()
            expect(data.activeRunId).toBeUndefined()
        })

        it.each([
            [valid({ name: ' ' }), /name is required/],
            [valid({ instructions: undefined }), /instructions is required/],
            [valid({ trigger: { type: 'schedule', recurrence: { type: 'daily', time: '8am' }, timezone: 'UTC' } }), /HH:mm/],
            [valid({ trigger: { type: 'schedule', recurrence: { type: 'daily', time: '08:00' }, timezone: 'Mars/Olympus' } }), /not a valid IANA timezone/],
            [valid({ enabled: 'yes' }), /true or false/],
            [valid({ modelProvider: 'anthropic' }), /both the model provider and the model name/],
            [valid({ trigger: { type: 'schedule', recurrence: { type: 'once', at: '2026-01-01T10:00' }, timezone: 'UTC' } }), /already passed/],
        ])('rejects %j', async (payload, message) => {
            await expect(create(payload)).rejects.toThrow(message)
            expect(automations().docs).toHaveLength(0)
        })

        it('needs a user', async () => {
            await expect(container.resolve(CreateAutomationUseCase).execute({ payload: valid() as any })).rejects.toThrow(/CurrentUser/)
        })

        it('keeps the model chosen for the automation', async () => {
            const { data } = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            expect(data).toMatchObject({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' })
        })
    })

    describe('updating', () => {
        it('changes the fields and keeps the rest', async () => {
            const { data: automation } = await create()
            const { data } = await update(String(automation._id), { name: 'Evening report', __v: automation.__v })

            expect(data).toMatchObject({ name: 'Evening report', instructions: 'Summarize my open tickets' })
            expect(new Date(data.nextRunAt as Date).toISOString()).toBe('2026-10-14T13:00:00.000Z')
        })

        it('recalculates the next run when the recurrence or the timezone change', async () => {
            const { data: automation } = await create()

            const weekly = await update(String(automation._id), { trigger: { recurrence: { type: 'weekly', days: [1], time: '09:00' } } })
            expect(new Date(weekly.data.nextRunAt as Date).toISOString()).toBe('2026-10-19T14:00:00.000Z')

            const moved = await update(String(automation._id), { trigger: { timezone: 'Europe/Madrid' } })
            expect(new Date(moved.data.nextRunAt as Date).toISOString()).toBe('2026-10-19T07:00:00.000Z')
        })

        it('turns off without a next run and turns on again counting from now', async () => {
            const { data: automation } = await create()
            const id = String(automation._id)

            const off = await update(id, { enabled: false })
            expect(off.data.enabled).toBe(false)
            expect(off.data.nextRunAt).toBeUndefined()
            expect(stored().nextRunAt).toBeUndefined()

            jest.setSystemTime(new Date('2026-10-20T20:00:00Z'))
            const on = await update(id, { enabled: true })

            expect(on.data.enabled).toBe(true)
            expect(new Date(on.data.nextRunAt as Date).toISOString()).toBe('2026-10-21T13:00:00.000Z')
        })

        it('does not let the payload change what the system manages', async () => {
            const { data: automation } = await create()
            const id = String(automation._id)
            const claimedAt = new Date('2026-10-14T12:00:00Z')
            Object.assign(stored(), { lockedBy: 'worker-1', lockedUntil: new Date(claimedAt.getTime() + 600000), lastRunStatus: 'failed' })

            const { data } = await update(id, { name: 'x', nextRunAt: '2030-01-01T00:00:00Z', lockedBy: 'hacker', lockedUntil: '2000-01-01T00:00:00Z', lastRunStatus: 'completed', ownerId: new ObjectId().toHexString() })

            expect(data).toMatchObject({ lockedBy: 'worker-1', lastRunStatus: 'failed' })
            expect(new Date(data.nextRunAt as Date).toISOString()).toBe('2026-10-14T13:00:00.000Z')
            expect(String(data.ownerId)).toBe(OWNER)
        })

        it('clears the model with an empty value', async () => {
            const { data: automation } = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            await update(String(automation._id), { modelProvider: null, modelName: null })

            expect(stored().modelProvider).toBeUndefined()
            expect(stored().modelName).toBeUndefined()
        })

        it('rejects a change that leaves only one of provider and name', async () => {
            const { data: automation } = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            await expect(update(String(automation._id), { modelName: null })).rejects.toThrow(/both the model provider and the model name/)
        })

        it('rejects a stale version and a missing automation', async () => {
            const { data: automation } = await create()

            await expect(update(String(automation._id), { name: 'x', __v: (automation.__v as number) - 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
            await expect(update(new ObjectId().toHexString(), { name: 'x' })).rejects.toThrow(/not found/)
            await expect(update(String(automation._id), {})).rejects.toThrow(/Payload is required/)
        })

        it('does not turn on an automation whose single date has passed', async () => {
            const { data: automation } = await create(valid({ trigger: { type: 'schedule', recurrence: { type: 'once', at: '2026-10-14T10:00' }, timezone: 'America/Lima' } }))
            const id = String(automation._id)
            await update(id, { enabled: false })
            jest.setSystemTime(new Date('2026-12-01T00:00:00Z'))

            await expect(update(id, { enabled: true })).rejects.toThrow(/already passed/)
        })

        it('works for an admin as for any user', async () => {
            const { data: automation } = await create(valid(), admin)

            const { data } = await update(String(automation._id), { name: 'x' }, admin)

            expect(data.name).toBe('x')
        })
    })

    describe('reading', () => {
        it('gets one automation and returns null when there is none', async () => {
            const { data: automation } = await create()
            const get = container.resolve(GetAutomationByIdUseCase)

            expect((await get.execute({ id: String(automation._id) })).data?.name).toBe('Morning report')
            expect((await get.execute({ id: new ObjectId().toHexString() })).data).toBeNull()
        })

        it('lists the automations of the user, newest first, with pagination', async () => {
            for (const name of ['a', 'b', 'c']) {
                jest.setSystemTime(new Date(NOW.getTime() + ['a', 'b', 'c'].indexOf(name) * 1000))
                await create(valid({ name }))
            }
            await create(valid({ name: 'someone else' }), { userId: new ObjectId().toHexString(), isAdmin: () => false })

            const list = container.resolve(ListAutomationsByUserUseCase)
            const first = await list.execute({ currentUser: user, options: { page: 1, limit: 2 } })
            const second = await list.execute({ currentUser: user, options: { page: 2, limit: 2 } })

            expect(first.data.map(automation => automation.name)).toEqual(['c', 'b'])
            expect(second.data.map(automation => automation.name)).toEqual(['a'])
        })
    })

    describe('deleting', () => {
        it('removes it from the lists and from what the worker takes', async () => {
            const { data: automation } = await create()
            const remove = container.resolve(DeleteAutomationUseCase)

            await remove.execute({ id: String(automation._id), currentUser: user })

            expect(stored().deletedAt).toBeInstanceOf(Date)
            expect(stored().nextRunAt).toBeUndefined()
            expect((await container.resolve(ListAutomationsByUserUseCase).execute({ currentUser: user })).data).toHaveLength(0)
        })

        it('only lets an admin delete it for good', async () => {
            const { data: automation } = await create()
            const remove = container.resolve(DeleteAutomationUseCase)

            await expect(remove.execute({ id: String(automation._id), hardDelete: true, currentUser: user })).rejects.toBeDefined()
            expect(automations().docs).toHaveLength(1)

            await remove.execute({ id: String(automation._id), hardDelete: true, currentUser: admin })
            expect(automations().docs).toHaveLength(0)
        })
    })

    describe('previewing', () => {
        it('lists the next runs of a recurrence without saving anything', async () => {
            const { data } = await container.resolve(PreviewAutomationRunsUseCase).execute({ recurrence: { type: 'weekly', days: [1, 5], time: '08:00' }, timezone: 'UTC', count: 3 })

            expect(data.runs.map(date => date.toISOString())).toEqual(['2026-10-16T08:00:00.000Z', '2026-10-19T08:00:00.000Z', '2026-10-23T08:00:00.000Z'])
            expect(automations().docs).toHaveLength(0)
        })

        it('validates what it receives', async () => {
            const preview = container.resolve(PreviewAutomationRunsUseCase)

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
            const { data } = await container.resolve(ListAutomationRunsByAutomationUseCase).execute({ automationId: String(automationId) })

            expect(data.map(run => run.status)).toEqual(['failed', 'completed'])
        })

        it('lists the runs of a user and can filter by status', async () => {
            await seed()
            const list = container.resolve(ListAutomationRunsByUserUseCase)

            expect((await list.execute({ currentUser: user })).data.map(run => run.status)).toEqual(['paused', 'failed', 'completed'])
            expect((await list.execute({ currentUser: user, status: 'paused' })).data).toHaveLength(1)
        })

        it('needs a user and an automation', async () => {
            await expect(container.resolve(ListAutomationRunsByUserUseCase).execute({})).rejects.toThrow(/CurrentUser/)
            await expect(container.resolve(ListAutomationRunsByAutomationUseCase).execute({ automationId: '' })).rejects.toThrow(/automationId/)
        })
    })
})
