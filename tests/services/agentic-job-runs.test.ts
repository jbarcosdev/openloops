import 'reflect-metadata'
import { container } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { CreateAgenticJobUseCase } from '@services/agentic-jobs/use-cases/create-agentic-job.use-case'
import { UpdateAgenticJobUseCase } from '@services/agentic-jobs/use-cases/update-agentic-job.use-case'
import { ClaimDueAgenticJobsUseCase } from '@services/agentic-jobs/use-cases/claim-due-agentic-jobs.use-case'
import { StartAgenticJobRunUseCase } from '@services/agentic-jobs/use-cases/start-agentic-job-run.use-case'
import { FinishAgenticJobRunUseCase } from '@services/agentic-jobs/use-cases/finish-agentic-job-run.use-case'
import { SyncAgenticJobRunUseCase } from '@services/agentic-jobs/use-cases/sync-agentic-job-run.use-case'
import { SyncAgenticJobRunsUseCase } from '@services/agentic-jobs/use-cases/sync-agentic-job-runs.use-case'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const OWNER = new ObjectId().toHexString()
const user: any = { userId: OWNER, isAdmin: () => false }
const START = new Date('2026-10-14T07:00:00Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const LEASE = 10 * MINUTE

const jobs = () => fakeMongo.collection('agentic_jobs')
const runs = () => fakeMongo.collection('agentic_job_runs')
const job = () => jobs().docs[0]
const at = (value: any) => new Date(value).toISOString()

const claim = (workerId: string, now: Date) => container.resolve(ClaimDueAgenticJobsUseCase).execute({ workerId, now, leaseMs: LEASE })
const finish = (runId: any, workerId: string, status: 'completed' | 'paused' | 'failed', now: Date, error?: any) =>
    container.resolve(FinishAgenticJobRunUseCase).execute({ runId: String(runId), workerId, status, now, error })
const sync = (runId: any, now: Date) => container.resolve(SyncAgenticJobRunUseCase).execute({ runId: String(runId), now })
const seedChat = (state: Record<string, any>) => fakeMongo.collection('chats').insertOne({ state, __v: 1 }).then(result => result.insertedId)

describe('running agentic jobs', () => {
    let id: string

    const createJob = async (recurrence: any = { type: 'daily', time: '08:00' }) => {
        const { data } = await container.resolve(CreateAgenticJobUseCase).execute({
            payload: { name: 'Report', instructions: 'Summarize', recurrence, timezone: 'UTC', modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' } as any,
            currentUser: user,
        })
        id = String(data._id)
        return data
    }

    beforeEach(async () => {
        fakeMongo.reset()
        jest.useFakeTimers({ now: START })
        await createJob()
    })

    afterEach(() => jest.useRealTimers())

    describe('claiming', () => {
        it('takes nothing before the time arrives', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T07:59:00Z'))

            expect(data.claimed).toHaveLength(0)
            expect(runs().docs).toHaveLength(0)
        })

        it('takes the job when the time arrives, records a run and moves the next run', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))

            expect(data.claimed).toHaveLength(1)
            expect(runs().docs).toHaveLength(1)
            expect(runs().docs[0]).toMatchObject({
                status: 'running',
                trigger: 'schedule',
                instructions: 'Summarize',
                modelProvider: 'anthropic',
                modelName: 'claude-haiku-5-5',
                workerId: 'w1',
            })
            expect(String(runs().docs[0].ownerId)).toBe(OWNER)
            expect(at(runs().docs[0].scheduledFor)).toBe('2026-10-14T08:00:00.000Z')
            expect(at(job().nextRunAt)).toBe('2026-10-15T08:00:00.000Z')
            expect(job().lockedBy).toBe('w1')
            expect(String(job().activeRunId)).toBe(String(runs().docs[0]._id))
        })

        it('is won by one of several workers that ask at the same time', async () => {
            const results = await Promise.all(['a', 'b', 'c', 'd'].map(worker => claim(worker, new Date('2026-10-14T08:00:00Z'))))

            expect(results.flatMap(result => result.data.claimed)).toHaveLength(1)
            expect(runs().docs).toHaveLength(1)
        })

        it('does not run twice while it is being run', async () => {
            await claim('w1', new Date('2026-10-14T08:00:00Z'))

            expect((await claim('w2', new Date('2026-10-14T08:05:00Z'))).data.claimed).toHaveLength(0)
        })

        it('runs once when many runs were missed and counts the next from now', async () => {
            const { data } = await claim('w1', new Date('2026-10-17T20:00:00Z'))

            expect(data.claimed).toHaveLength(1)
            expect(runs().docs).toHaveLength(1)
            expect(at(job().nextRunAt)).toBe('2026-10-18T08:00:00.000Z')
        })

        it('does not take a job that is off', async () => {
            await container.resolve(UpdateAgenticJobUseCase).execute({ id, payload: { enabled: false }, currentUser: user })

            expect((await claim('w1', new Date('2026-10-14T09:00:00Z'))).data.claimed).toHaveLength(0)
        })
    })

    describe('a run that fails', () => {
        it('is not repeated until the next occurrence', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            await finish(data.claimed[0].run._id, 'w1', 'failed', new Date('2026-10-14T08:01:00Z'), { code: 'LLM_TIMEOUT', message: 'The model did not answer in time' })

            expect(runs().docs[0]).toMatchObject({ status: 'failed', error: { code: 'LLM_TIMEOUT' } })
            expect(job()).toMatchObject({ lastRunStatus: 'failed' })
            expect(job().lockedBy).toBeUndefined()
            expect((await claim('w1', new Date('2026-10-14T08:02:00Z'))).data.claimed).toHaveLength(0)
            expect((await claim('w1', new Date('2026-10-14T23:59:00Z'))).data.claimed).toHaveLength(0)
            expect((await claim('w1', new Date('2026-10-15T08:00:00Z'))).data.claimed).toHaveLength(1)
        })

        it('is not repeated when the worker dies, only marked as lost', async () => {
            await claim('w1', new Date('2026-10-14T08:00:00Z'))
            const later = new Date(new Date('2026-10-14T08:00:00Z').getTime() + 2 * LEASE)

            const { data } = await claim('w2', later)

            expect(data.claimed).toHaveLength(0)

            const lost = await sync(runs().docs[0]._id, later)

            expect(lost.data).toMatchObject({ status: 'failed', error: { code: 'WORKER_LOST' } })
            expect(job().lastRunStatus).toBe('failed')
            expect(job().activeRunId).toBeUndefined()
        })
    })

    describe('a run that finishes well', () => {
        it('records the result and releases the job', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            const finished = await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T08:03:00Z'))

            expect(finished.data).toMatchObject({ status: 'completed' })
            expect(at(runs().docs[0].finishedAt)).toBe('2026-10-14T08:03:00.000Z')
            expect(job()).toMatchObject({ lastRunStatus: 'completed' })
            expect(at(job().lastRunAt)).toBe('2026-10-14T08:03:00.000Z')
            expect(job().lockedBy).toBeUndefined()
            expect(job().activeRunId).toBeUndefined()
        })

        it('does not turn on again a job that the user turned off while it was running', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            await container.resolve(UpdateAgenticJobUseCase).execute({ id, payload: { enabled: false }, currentUser: user })
            await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T08:03:00Z'))

            expect(job().enabled).toBe(false)
            expect(job().nextRunAt).toBeUndefined()
        })

        it('does not fail when the lock was lost to another worker', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            job().lockedBy = 'someone else'

            const finished = await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T08:03:00Z'))

            expect(finished.data).toMatchObject({ status: 'completed' })
            expect(job().lockedBy).toBe('someone else')
        })
    })

    describe('a job that runs once', () => {
        it('runs a single time', async () => {
            fakeMongo.reset()
            await createJob({ type: 'once', at: '2026-10-14T10:00' })

            expect(at(job().nextRunAt)).toBe('2026-10-14T10:00:00.000Z')

            const { data } = await claim('w1', new Date('2026-10-14T10:00:00Z'))
            expect(data.claimed).toHaveLength(1)
            expect(job().nextRunAt).toBeUndefined()

            await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T10:02:00Z'))
            expect((await claim('w1', new Date('2026-10-20T10:00:00Z'))).data.claimed).toHaveLength(0)
        })
    })

    describe('a run that waits for the user', () => {
        const pause = async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            const run = data.claimed[0].run
            const chatId = await seedChat({ status: 'awaiting_user_confirmation' })
            Object.assign(runs().docs[0], { chatId })
            await finish(run._id, 'w1', 'paused', new Date('2026-10-14T08:02:00Z'))

            return { runId: run._id, chatId }
        }

        it('stays paused and keeps the job pointing at it', async () => {
            const { runId } = await pause()

            expect(runs().docs[0].status).toBe('paused')
            expect(runs().docs[0].finishedAt).toBeUndefined()
            expect(String(job().activeRunId)).toBe(String(runId))
            expect(job().lastRunStatus).toBe('paused')
            expect(job().lockedBy).toBeUndefined()
        })

        it('is still paused while the chat waits', async () => {
            const { runId } = await pause()

            expect((await sync(runId, new Date('2026-10-14T09:00:00Z'))).data?.status).toBe('paused')
        })

        it('becomes completed when the user answers and the chat finishes', async () => {
            const { runId, chatId } = await pause()
            fakeMongo.collection('chats').docs.find(doc => String(doc._id) === String(chatId))!.state = { status: 'idle' }

            const { data } = await sync(runId, new Date('2026-10-14T09:00:00Z'))

            expect(data).toMatchObject({ status: 'completed' })
            expect(at(runs().docs[0].finishedAt)).toBe('2026-10-14T09:00:00.000Z')
            expect(job().lastRunStatus).toBe('completed')
            expect(job().activeRunId).toBeUndefined()
        })

        it('becomes failed with the error of the chat', async () => {
            const { runId, chatId } = await pause()
            fakeMongo.collection('chats').docs.find(doc => String(doc._id) === String(chatId))!.state = { status: 'failed', lastError: { code: 'AGENT_RUN_FAILED', message: 'boom' } }

            const { data } = await sync(runId, new Date('2026-10-14T09:00:00Z'))

            expect(data).toMatchObject({ status: 'failed', error: { code: 'AGENT_RUN_FAILED', message: 'boom' } })
            expect(job().lastRunStatus).toBe('failed')
        })

        it('makes the next occurrence skip, and records it', async () => {
            await pause()

            const { data } = await claim('w1', new Date('2026-10-15T08:00:00Z'))

            expect(data.claimed).toHaveLength(0)
            expect(data.skipped).toHaveLength(1)
            expect(runs().docs).toHaveLength(2)
            expect(runs().docs[1]).toMatchObject({ status: 'skipped', skipReason: expect.stringMatching(/waiting for the user/) })
            expect(at(job().nextRunAt)).toBe('2026-10-16T08:00:00.000Z')
            expect(job().lockedBy).toBeUndefined()
            expect(job().lastRunStatus).toBe('paused')
            expect(String(job().activeRunId)).toBe(String(runs().docs[0]._id))
        })

        it('runs normally when the user already finished it before the next occurrence', async () => {
            const { chatId } = await pause()
            fakeMongo.collection('chats').docs.find(doc => String(doc._id) === String(chatId))!.state = { status: 'idle' }

            const { data } = await claim('w1', new Date('2026-10-15T08:00:00Z'))

            expect(data.claimed).toHaveLength(1)
            expect(data.skipped).toHaveLength(0)
            expect(runs().docs[0].status).toBe('completed')
        })
    })

    describe('running by hand', () => {
        const start = (now: Date, worker = 'w1') => container.resolve(StartAgenticJobRunUseCase).execute({ jobId: id, workerId: worker, now, leaseMs: LEASE })

        it('runs at once without moving the next run', async () => {
            const before = at(job().nextRunAt)

            const { data } = await start(new Date('2026-10-14T07:10:00Z'))

            expect(data.run).toMatchObject({ status: 'running', trigger: 'manual' })
            expect(at(job().nextRunAt)).toBe(before)
            expect(job().lockedBy).toBe('w1')
        })

        it('is refused while the job is running and allowed after', async () => {
            const { data } = await start(new Date('2026-10-14T07:10:00Z'))

            await expect(start(new Date('2026-10-14T07:11:00Z'), 'w2')).rejects.toThrow(/already running/)
            await finish(data.run._id, 'w1', 'completed', new Date('2026-10-14T07:12:00Z'))
            await expect(start(new Date('2026-10-14T07:13:00Z'), 'w2')).resolves.toBeDefined()
        })

        it('is not repeated by the schedule when it fails', async () => {
            const { data } = await start(new Date('2026-10-14T07:10:00Z'))
            await finish(data.run._id, 'w1', 'failed', new Date('2026-10-14T07:11:00Z'), { message: 'boom' })

            expect((await claim('w1', new Date('2026-10-14T07:30:00Z'))).data.claimed).toHaveLength(0)
            expect((await claim('w1', new Date('2026-10-14T08:00:00Z'))).data.claimed).toHaveLength(1)
        })

        it('fails for a job that does not exist', async () => {
            await expect(container.resolve(StartAgenticJobRunUseCase).execute({ jobId: new ObjectId().toHexString(), workerId: 'w1' })).rejects.toThrow(/not found/)
        })
    })

    describe('syncing every open run', () => {
        it('settles the paused runs that finished and the runs that lost their worker', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            const chatId = await seedChat({ status: 'idle' })
            Object.assign(runs().docs[0], { chatId, status: 'paused' })
            Object.assign(job(), { lockedBy: undefined, lockedUntil: undefined })
            const lost = await runs().insertOne({ jobId: new ObjectId(), ownerId: new ObjectId(OWNER), status: 'running', startedAt: new Date('2026-10-14T08:00:00Z'), __v: 1 })

            const result = await container.resolve(SyncAgenticJobRunsUseCase).execute({ now: new Date('2026-10-14T09:00:00Z') })

            expect(result.data).toEqual({ checked: 2, settled: 2 })
            expect(runs().docs.find(run => String(run._id) === String(data.claimed[0].run._id))!.status).toBe('completed')
            expect(runs().docs.find(run => String(run._id) === String(lost.insertedId))!.status).toBe('failed')
        })
    })
})
