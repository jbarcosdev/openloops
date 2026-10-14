import 'reflect-metadata'
import { ObjectId } from 'mongodb'
import { AgenticJob } from '@services/agentic-jobs/entities'
import { AgenticJobRepository } from '@services/agentic-jobs/repositories/agentic-job.repository'
import { AgenticJobRunRepository } from '@services/agentic-jobs/repositories/agentic-job-run.repository'
import { AgenticJobRun } from '@services/agentic-jobs/entities'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const OWNER = new ObjectId().toHexString()
const NOW = new Date('2026-10-14T12:00:00Z')
const LEASE = 10 * 60 * 1000
const HOUR = 60 * 60 * 1000

const jobs = () => fakeMongo.collection('agentic_jobs')

describe('agentic job repository', () => {
    const repository = new AgenticJobRepository()

    const create = async (props: Record<string, any> = {}): Promise<string> => {
        const job = AgenticJob.fromJSON({
            name: 'report',
            instructions: 'summarize the tickets',
            enabled: true,
            recurrence: { type: 'daily', time: '08:00' },
            timezone: 'UTC',
            ownerId: OWNER,
            nextRunAt: new Date(NOW.getTime() - 1000),
            ...props,
        })
        await repository.create(job)
        return String(job._id)
    }

    const claim = (id: string, workerId: string, now = NOW, nextRunAt: Date | undefined = new Date(NOW.getTime() + 24 * HOUR)) =>
        repository.claim({ id, workerId, now, leaseMs: LEASE, nextRunAt })

    beforeEach(() => fakeMongo.reset())

    describe('finding what is due', () => {
        it('returns only the active jobs whose time arrived and nobody is running', async () => {
            const due = await create({ name: 'due' })
            await create({ name: 'future', nextRunAt: new Date(NOW.getTime() + HOUR) })
            await create({ name: 'off', enabled: false })
            await create({ name: 'locked', lockedBy: 'w1', lockedUntil: new Date(NOW.getTime() + HOUR) })
            const expired = await create({ name: 'expired lock', lockedBy: 'w1', lockedUntil: new Date(NOW.getTime() - HOUR) })
            await create({ name: 'never scheduled', nextRunAt: undefined })
            await create({ name: 'deleted', deletedAt: new Date() })

            const found = await repository.findDue(NOW, 10)

            expect(found.map(job => job.name).sort()).toEqual(['due', 'expired lock'])
            expect(found.map(job => String(job._id)).sort()).toEqual([due, expired].sort())
        })

        it('returns the most overdue first and respects the limit', async () => {
            await create({ name: 'recent', nextRunAt: new Date(NOW.getTime() - 1000) })
            await create({ name: 'oldest', nextRunAt: new Date(NOW.getTime() - 3 * HOUR) })
            await create({ name: 'older', nextRunAt: new Date(NOW.getTime() - HOUR) })

            const found = await repository.findDue(NOW, 2)

            expect(found.map(job => job.name)).toEqual(['oldest', 'older'])
        })
    })

    describe('claiming a job', () => {
        it('locks it and moves the next run in one step', async () => {
            const id = await create()
            const next = new Date(NOW.getTime() + 24 * HOUR)

            const claimed = await claim(id, 'worker-1', NOW, next)

            expect(claimed).toMatchObject({ lockedBy: 'worker-1' })
            expect(new Date(claimed!.lockedUntil as Date).getTime()).toBe(NOW.getTime() + LEASE)
            expect(new Date(claimed!.nextRunAt as Date).getTime()).toBe(next.getTime())
        })

        it('lets only one of several workers get it', async () => {
            const id = await create()

            const results = await Promise.all(['a', 'b', 'c', 'd'].map(worker => claim(id, worker)))

            expect(results.filter(Boolean)).toHaveLength(1)
        })

        it('does not give a job again once its next run moved to the future', async () => {
            const id = await create()

            expect(await claim(id, 'a')).not.toBeNull()
            expect(await claim(id, 'b', new Date(NOW.getTime() + LEASE + 1))).toBeNull()
        })

        it('does not give a job that is locked, even if it is due again', async () => {
            const id = await create()
            await claim(id, 'a', NOW, new Date(NOW.getTime() - 1))

            expect(await claim(id, 'b', new Date(NOW.getTime() + LEASE - 1))).toBeNull()
        })

        it('gives it again when the lock expired and the job is due', async () => {
            const id = await create()
            await claim(id, 'a', NOW, new Date(NOW.getTime() - 1))

            const again = await claim(id, 'b', new Date(NOW.getTime() + LEASE + 1))

            expect(again).toMatchObject({ lockedBy: 'b' })
        })

        it('clears the next run when there is none, as in a job that runs once', async () => {
            const id = await create()

            const claimed = await repository.claim({ id, workerId: 'a', now: NOW, leaseMs: LEASE })

            expect(claimed?.nextRunAt).toBeUndefined()
            expect(jobs().docs[0].nextRunAt).toBeUndefined()
        })

        it('does not give a job that is off or deleted', async () => {
            const off = await create({ enabled: false })
            const removed = await create({ deletedAt: new Date() })

            expect(await claim(off, 'a')).toBeNull()
            expect(await claim(removed, 'a')).toBeNull()
        })
    })

    describe('running a job by hand', () => {
        it('takes the lock without caring about the next run, and does not move it', async () => {
            const future = new Date(NOW.getTime() + 5 * HOUR)
            const id = await create({ nextRunAt: future })

            const claimed = await repository.claimManual({ id, workerId: 'a', now: NOW, leaseMs: LEASE })

            expect(claimed).toMatchObject({ lockedBy: 'a' })
            expect(new Date(claimed!.nextRunAt as Date).getTime()).toBe(future.getTime())
        })

        it('is refused while the job is being run', async () => {
            const id = await create()
            await claim(id, 'a')

            expect(await repository.claimManual({ id, workerId: 'b', now: NOW, leaseMs: LEASE })).toBeNull()
        })
    })

    describe('the lease', () => {
        it('is renewed only by the worker that holds it', async () => {
            const id = await create()
            await claim(id, 'a')
            const until = new Date(NOW.getTime() + 2 * LEASE)

            expect(await repository.renewLease(id, 'b', until)).toBeNull()
            const renewed = await repository.renewLease(id, 'a', until)

            expect(new Date(renewed!.lockedUntil as Date).getTime()).toBe(until.getTime())
        })

        it('is released with the result of the run', async () => {
            const id = await create()
            await claim(id, 'a')

            const released = await repository.release(id, 'a', { lastRunAt: NOW, lastRunStatus: 'completed' })

            expect(released).toMatchObject({ lastRunStatus: 'completed' })
            expect(released?.lockedBy).toBeUndefined()
            expect(released?.lockedUntil).toBeUndefined()
        })

        it('is not released by another worker', async () => {
            const id = await create()
            await claim(id, 'a')

            expect(await repository.release(id, 'b', { lastRunAt: NOW, lastRunStatus: 'failed' })).toBeNull()
            expect(jobs().docs[0].lockedBy).toBe('a')
        })

        it('keeps the paused run as the active one and clears it otherwise', async () => {
            const id = await create()
            const runId = new ObjectId()
            await claim(id, 'a')

            await repository.release(id, 'a', { lastRunAt: NOW, lastRunStatus: 'paused', activeRunId: runId })
            expect(String(jobs().docs[0].activeRunId)).toBe(String(runId))

            await claim(id, 'a', new Date(NOW.getTime() + 25 * HOUR), new Date(NOW.getTime() + 48 * HOUR))
            await repository.release(id, 'a', { lastRunAt: NOW, lastRunStatus: 'completed' })
            expect(jobs().docs[0].activeRunId).toBeUndefined()
        })
    })
})

describe('agentic job run repository', () => {
    const repository = new AgenticJobRunRepository()

    beforeEach(() => fakeMongo.reset())

    it('lists the runs of a job and of a user', async () => {
        const jobId = new ObjectId()
        const otherJob = new ObjectId()
        const owner = new ObjectId(OWNER)

        for (const [job, status] of [[jobId, 'completed'], [jobId, 'failed'], [otherJob, 'paused']] as const) {
            await repository.create(AgenticJobRun.fromJSON({ jobId: job, ownerId: owner, status, trigger: 'schedule', createdAt: new Date() }))
        }

        expect(await repository.findByJob(String(jobId), { page: 1, limit: 10 })).toHaveLength(2)
        expect(await repository.findByOwner(OWNER, { page: 1, limit: 10 })).toHaveLength(3)
        expect((await repository.findByStatus('paused', 10)).map(run => String(run.jobId))).toEqual([String(otherJob)])
    })
})
