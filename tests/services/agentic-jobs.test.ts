import 'reflect-metadata'
import { container } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { CreateAgenticJobUseCase } from '@services/agentic-jobs/use-cases/create-agentic-job.use-case'
import { UpdateAgenticJobUseCase } from '@services/agentic-jobs/use-cases/update-agentic-job.use-case'
import { GetAgenticJobByIdUseCase } from '@services/agentic-jobs/use-cases/get-agentic-job-by-id.use-case'
import { ListAgenticJobsByUserUseCase } from '@services/agentic-jobs/use-cases/list-agentic-jobs-by-user.use-case'
import { DeleteAgenticJobUseCase } from '@services/agentic-jobs/use-cases/delete-agentic-job.use-case'
import { PreviewAgenticJobRunsUseCase } from '@services/agentic-jobs/use-cases/preview-agentic-job-runs.use-case'
import { ListAgenticJobRunsByJobUseCase } from '@services/agentic-jobs/use-cases/list-agentic-job-runs-by-job.use-case'
import { ListAgenticJobRunsByUserUseCase } from '@services/agentic-jobs/use-cases/list-agentic-job-runs-by-user.use-case'
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

const jobs = () => fakeMongo.collection('agentic_jobs')
const runs = () => fakeMongo.collection('agentic_job_runs')
const stored = () => jobs().docs[0]

const valid = (extra: Record<string, any> = {}) => ({
    name: 'Morning report',
    instructions: 'Summarize my open tickets',
    recurrence: { type: 'daily', time: '08:00' },
    timezone: 'America/Lima',
    ...extra,
})

const create = (payload: Record<string, any> = valid(), currentUser = user) =>
    container.resolve(CreateAgenticJobUseCase).execute({ payload, currentUser })

const update = (id: string, payload: Record<string, any>, currentUser = user) =>
    container.resolve(UpdateAgenticJobUseCase).execute({ id, payload, currentUser })

describe('agentic jobs', () => {
    beforeEach(() => {
        fakeMongo.reset()
        jest.useFakeTimers({ now: NOW })
    })

    afterEach(() => jest.useRealTimers())

    describe('creating', () => {
        it('saves the job as active with the first run calculated in its timezone', async () => {
            const { data } = await create()

            expect(data).toMatchObject({ name: 'Morning report', enabled: true, timezone: 'America/Lima' })
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
            [valid({ recurrence: { type: 'daily', time: '8am' } }), /HH:mm/],
            [valid({ timezone: 'Mars/Olympus' }), /not a valid IANA timezone/],
            [valid({ enabled: 'yes' }), /true or false/],
            [valid({ modelProvider: 'anthropic' }), /both the model provider and the model name/],
            [valid({ recurrence: { type: 'once', at: '2026-01-01T10:00' } }), /already passed/],
        ])('rejects %j', async (payload, message) => {
            await expect(create(payload)).rejects.toThrow(message)
            expect(jobs().docs).toHaveLength(0)
        })

        it('needs a user', async () => {
            await expect(container.resolve(CreateAgenticJobUseCase).execute({ payload: valid() as any })).rejects.toThrow(/CurrentUser/)
        })

        it('keeps the model chosen for the job', async () => {
            const { data } = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            expect(data).toMatchObject({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' })
        })
    })

    describe('updating', () => {
        it('changes the fields and keeps the rest', async () => {
            const { data: job } = await create()
            const { data } = await update(String(job._id), { name: 'Evening report', __v: job.__v })

            expect(data).toMatchObject({ name: 'Evening report', instructions: 'Summarize my open tickets' })
            expect(new Date(data.nextRunAt as Date).toISOString()).toBe('2026-10-14T13:00:00.000Z')
        })

        it('recalculates the next run when the recurrence or the timezone change', async () => {
            const { data: job } = await create()

            const weekly = await update(String(job._id), { recurrence: { type: 'weekly', days: [1], time: '09:00' } })
            expect(new Date(weekly.data.nextRunAt as Date).toISOString()).toBe('2026-10-19T14:00:00.000Z')

            const moved = await update(String(job._id), { timezone: 'Europe/Madrid' })
            expect(new Date(moved.data.nextRunAt as Date).toISOString()).toBe('2026-10-19T07:00:00.000Z')
        })

        it('turns off without a next run and turns on again counting from now', async () => {
            const { data: job } = await create()
            const id = String(job._id)

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
            const { data: job } = await create()
            const id = String(job._id)
            const claimedAt = new Date('2026-10-14T12:00:00Z')
            Object.assign(stored(), { lockedBy: 'worker-1', lockedUntil: new Date(claimedAt.getTime() + 600000), lastRunStatus: 'failed' })

            const { data } = await update(id, { name: 'x', nextRunAt: '2030-01-01T00:00:00Z', lockedBy: 'hacker', lockedUntil: '2000-01-01T00:00:00Z', lastRunStatus: 'completed', ownerId: new ObjectId().toHexString() })

            expect(data).toMatchObject({ lockedBy: 'worker-1', lastRunStatus: 'failed' })
            expect(new Date(data.nextRunAt as Date).toISOString()).toBe('2026-10-14T13:00:00.000Z')
            expect(String(data.ownerId)).toBe(OWNER)
        })

        it('clears the model with an empty value', async () => {
            const { data: job } = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            await update(String(job._id), { modelProvider: null, modelName: null })

            expect(stored().modelProvider).toBeUndefined()
            expect(stored().modelName).toBeUndefined()
        })

        it('rejects a change that leaves only one of provider and name', async () => {
            const { data: job } = await create(valid({ modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' }))

            await expect(update(String(job._id), { modelName: null })).rejects.toThrow(/both the model provider and the model name/)
        })

        it('rejects a stale version and a missing job', async () => {
            const { data: job } = await create()

            await expect(update(String(job._id), { name: 'x', __v: (job.__v as number) - 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
            await expect(update(new ObjectId().toHexString(), { name: 'x' })).rejects.toThrow(/not found/)
            await expect(update(String(job._id), {})).rejects.toThrow(/Payload is required/)
        })

        it('does not turn on a job whose single date has passed', async () => {
            const { data: job } = await create(valid({ recurrence: { type: 'once', at: '2026-10-14T10:00' } }))
            const id = String(job._id)
            await update(id, { enabled: false })
            jest.setSystemTime(new Date('2026-12-01T00:00:00Z'))

            await expect(update(id, { enabled: true })).rejects.toThrow(/already passed/)
        })

        it('works for an admin as for any user', async () => {
            const { data: job } = await create(valid(), admin)

            const { data } = await update(String(job._id), { name: 'x' }, admin)

            expect(data.name).toBe('x')
        })
    })

    describe('reading', () => {
        it('gets one job and returns null when there is none', async () => {
            const { data: job } = await create()
            const get = container.resolve(GetAgenticJobByIdUseCase)

            expect((await get.execute({ id: String(job._id) })).data?.name).toBe('Morning report')
            expect((await get.execute({ id: new ObjectId().toHexString() })).data).toBeNull()
        })

        it('lists the jobs of the user, newest first, with pagination', async () => {
            for (const name of ['a', 'b', 'c']) {
                jest.setSystemTime(new Date(NOW.getTime() + ['a', 'b', 'c'].indexOf(name) * 1000))
                await create(valid({ name }))
            }
            await create(valid({ name: 'someone else' }), { userId: new ObjectId().toHexString(), isAdmin: () => false })

            const list = container.resolve(ListAgenticJobsByUserUseCase)
            const first = await list.execute({ currentUser: user, options: { page: 1, limit: 2 } })
            const second = await list.execute({ currentUser: user, options: { page: 2, limit: 2 } })

            expect(first.data.map(job => job.name)).toEqual(['c', 'b'])
            expect(second.data.map(job => job.name)).toEqual(['a'])
        })
    })

    describe('deleting', () => {
        it('removes it from the lists and from what the worker takes', async () => {
            const { data: job } = await create()
            const remove = container.resolve(DeleteAgenticJobUseCase)

            await remove.execute({ id: String(job._id), currentUser: user })

            expect(stored().deletedAt).toBeInstanceOf(Date)
            expect(stored().nextRunAt).toBeUndefined()
            expect((await container.resolve(ListAgenticJobsByUserUseCase).execute({ currentUser: user })).data).toHaveLength(0)
        })

        it('only lets an admin delete it for good', async () => {
            const { data: job } = await create()
            const remove = container.resolve(DeleteAgenticJobUseCase)

            await expect(remove.execute({ id: String(job._id), hardDelete: true, currentUser: user })).rejects.toBeDefined()
            expect(jobs().docs).toHaveLength(1)

            await remove.execute({ id: String(job._id), hardDelete: true, currentUser: admin })
            expect(jobs().docs).toHaveLength(0)
        })
    })

    describe('previewing', () => {
        it('lists the next runs of a recurrence without saving anything', async () => {
            const { data } = await container.resolve(PreviewAgenticJobRunsUseCase).execute({ recurrence: { type: 'weekly', days: [1, 5], time: '08:00' }, timezone: 'UTC', count: 3 })

            expect(data.runs.map(date => date.toISOString())).toEqual(['2026-10-16T08:00:00.000Z', '2026-10-19T08:00:00.000Z', '2026-10-23T08:00:00.000Z'])
            expect(jobs().docs).toHaveLength(0)
        })

        it('validates what it receives', async () => {
            const preview = container.resolve(PreviewAgenticJobRunsUseCase)

            await expect(preview.execute({ recurrence: { type: 'daily', time: 'x' }, timezone: 'UTC' })).rejects.toThrow(/HH:mm/)
            await expect(preview.execute({ recurrence: { type: 'daily', time: '08:00' }, timezone: 'Nope/Nope' })).rejects.toThrow(/IANA/)
        })
    })

    describe('listing runs', () => {
        const seed = async () => {
            const jobId = new ObjectId()
            const otherJob = new ObjectId()
            const owner = new ObjectId(OWNER)
            const rows: [ObjectId, string, number][] = [[jobId, 'completed', 1], [jobId, 'failed', 2], [otherJob, 'paused', 3]]

            for (const [job, status, offset] of rows) {
                await runs().insertOne({ jobId: job, ownerId: owner, status, trigger: 'schedule', createdAt: new Date(NOW.getTime() + offset * 1000), __v: 1 })
            }
            await runs().insertOne({ jobId: new ObjectId(), ownerId: new ObjectId(), status: 'completed', createdAt: NOW, __v: 1 })

            return { jobId }
        }

        it('lists the runs of a job, newest first', async () => {
            const { jobId } = await seed()
            const { data } = await container.resolve(ListAgenticJobRunsByJobUseCase).execute({ jobId: String(jobId) })

            expect(data.map(run => run.status)).toEqual(['failed', 'completed'])
        })

        it('lists the runs of a user and can filter by status', async () => {
            await seed()
            const list = container.resolve(ListAgenticJobRunsByUserUseCase)

            expect((await list.execute({ currentUser: user })).data.map(run => run.status)).toEqual(['paused', 'failed', 'completed'])
            expect((await list.execute({ currentUser: user, status: 'paused' })).data).toHaveLength(1)
        })

        it('needs a user and a job', async () => {
            await expect(container.resolve(ListAgenticJobRunsByUserUseCase).execute({})).rejects.toThrow(/CurrentUser/)
            await expect(container.resolve(ListAgenticJobRunsByJobUseCase).execute({ jobId: '' })).rejects.toThrow(/jobId/)
        })
    })
})
