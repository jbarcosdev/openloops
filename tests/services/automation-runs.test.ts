import 'reflect-metadata'
import { container } from 'tsyringe'
import { ObjectId } from 'mongodb'
import { CreateAutomationUseCase } from '@services/automations/use-cases/create-automation.use-case'
import { UpdateAutomationUseCase } from '@services/automations/use-cases/update-automation.use-case'
import { ClaimDueAutomationsUseCase } from '@services/automations/use-cases/claim-due-automations.use-case'
import { StartAutomationRunUseCase } from '@services/automations/use-cases/start-automation-run.use-case'
import { FinishAutomationRunUseCase } from '@services/automations/use-cases/finish-automation-run.use-case'
import { SyncAutomationRunUseCase } from '@services/automations/use-cases/sync-automation-run.use-case'
import { SyncAutomationRunsUseCase } from '@services/automations/use-cases/sync-automation-runs.use-case'
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

const automations = () => fakeMongo.collection('automations')
const runs = () => fakeMongo.collection('automation_runs')
const automation = () => automations().docs[0]
const at = (value: any) => new Date(value).toISOString()

const claim = (workerId: string, now: Date) => container.resolve(ClaimDueAutomationsUseCase).execute({ workerId, now, leaseMs: LEASE })
const finish = (runId: any, workerId: string, status: 'completed' | 'paused' | 'failed', now: Date, error?: any) =>
    container.resolve(FinishAutomationRunUseCase).execute({ runId: String(runId), workerId, status, now, error })
const sync = (runId: any, now: Date) => container.resolve(SyncAutomationRunUseCase).execute({ runId: String(runId), now })
const seedChat = (state: Record<string, any>) => fakeMongo.collection('chats').insertOne({ state, __v: 1 }).then(result => result.insertedId)

describe('running automations', () => {
    let id: string

    const createAutomationFixture = async (recurrence: any = { type: 'daily', time: '08:00' }) => {
        const { data } = await container.resolve(CreateAutomationUseCase).execute({
            payload: { name: 'Report', instructions: 'Summarize', trigger: { type: 'schedule', recurrence, timezone: 'UTC' }, modelProvider: 'anthropic', modelName: 'claude-haiku-5-5' } as any,
            currentUser: user,
        })
        id = String(data._id)
        return data
    }

    beforeEach(async () => {
        fakeMongo.reset()
        jest.useFakeTimers({ now: START })
        await createAutomationFixture()
    })

    afterEach(() => jest.useRealTimers())

    describe('claiming', () => {
        it('takes nothing before the time arrives', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T07:59:00Z'))

            expect(data.claimed).toHaveLength(0)
            expect(runs().docs).toHaveLength(0)
        })

        it('takes the automation when the time arrives, records a run and moves the next run', async () => {
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
            expect(at(automation().nextRunAt)).toBe('2026-10-15T08:00:00.000Z')
            expect(automation().lockedBy).toBe('w1')
            expect(String(automation().activeRunId)).toBe(String(runs().docs[0]._id))
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
            expect(at(automation().nextRunAt)).toBe('2026-10-18T08:00:00.000Z')
        })

        it('does not take an automation that is off', async () => {
            await container.resolve(UpdateAutomationUseCase).execute({ id, payload: { enabled: false }, currentUser: user })

            expect((await claim('w1', new Date('2026-10-14T09:00:00Z'))).data.claimed).toHaveLength(0)
        })
    })

    describe('a run that fails', () => {
        it('is not repeated until the next occurrence', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            await finish(data.claimed[0].run._id, 'w1', 'failed', new Date('2026-10-14T08:01:00Z'), { code: 'LLM_TIMEOUT', message: 'The model did not answer in time' })

            expect(runs().docs[0]).toMatchObject({ status: 'failed', error: { code: 'LLM_TIMEOUT' } })
            expect(automation()).toMatchObject({ lastRunStatus: 'failed' })
            expect(automation().lockedBy).toBeUndefined()
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
            expect(automation().lastRunStatus).toBe('failed')
            expect(automation().activeRunId).toBeUndefined()
        })
    })

    describe('a run that finishes well', () => {
        it('records the result and releases the automation', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            const finished = await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T08:03:00Z'))

            expect(finished.data).toMatchObject({ status: 'completed' })
            expect(at(runs().docs[0].finishedAt)).toBe('2026-10-14T08:03:00.000Z')
            expect(automation()).toMatchObject({ lastRunStatus: 'completed' })
            expect(at(automation().lastRunAt)).toBe('2026-10-14T08:03:00.000Z')
            expect(automation().lockedBy).toBeUndefined()
            expect(automation().activeRunId).toBeUndefined()
        })

        it('does not turn on again an automation that the user turned off while it was running', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            await container.resolve(UpdateAutomationUseCase).execute({ id, payload: { enabled: false }, currentUser: user })
            await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T08:03:00Z'))

            expect(automation().enabled).toBe(false)
            expect(automation().nextRunAt).toBeUndefined()
        })

        it('does not fail when the lock was lost to another worker', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            automation().lockedBy = 'someone else'

            const finished = await finish(data.claimed[0].run._id, 'w1', 'completed', new Date('2026-10-14T08:03:00Z'))

            expect(finished.data).toMatchObject({ status: 'completed' })
            expect(automation().lockedBy).toBe('someone else')
        })
    })

    describe('an automation that runs once', () => {
        it('runs a single time', async () => {
            fakeMongo.reset()
            await createAutomationFixture({ type: 'once', at: '2026-10-14T10:00' })

            expect(at(automation().nextRunAt)).toBe('2026-10-14T10:00:00.000Z')

            const { data } = await claim('w1', new Date('2026-10-14T10:00:00Z'))
            expect(data.claimed).toHaveLength(1)
            expect(automation().nextRunAt).toBeUndefined()

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

        it('stays paused and keeps the automation pointing at it', async () => {
            const { runId } = await pause()

            expect(runs().docs[0].status).toBe('paused')
            expect(runs().docs[0].finishedAt).toBeUndefined()
            expect(String(automation().activeRunId)).toBe(String(runId))
            expect(automation().lastRunStatus).toBe('paused')
            expect(automation().lockedBy).toBeUndefined()
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
            expect(automation().lastRunStatus).toBe('completed')
            expect(automation().activeRunId).toBeUndefined()
        })

        it('becomes failed with the error of the chat', async () => {
            const { runId, chatId } = await pause()
            fakeMongo.collection('chats').docs.find(doc => String(doc._id) === String(chatId))!.state = { status: 'failed', lastError: { code: 'AGENT_RUN_FAILED', message: 'boom' } }

            const { data } = await sync(runId, new Date('2026-10-14T09:00:00Z'))

            expect(data).toMatchObject({ status: 'failed', error: { code: 'AGENT_RUN_FAILED', message: 'boom' } })
            expect(automation().lastRunStatus).toBe('failed')
        })

        it('makes the next occurrence skip, and records it', async () => {
            await pause()

            const { data } = await claim('w1', new Date('2026-10-15T08:00:00Z'))

            expect(data.claimed).toHaveLength(0)
            expect(data.skipped).toHaveLength(1)
            expect(runs().docs).toHaveLength(2)
            expect(runs().docs[1]).toMatchObject({ status: 'skipped', skipReason: expect.stringMatching(/waiting for the user/) })
            expect(at(automation().nextRunAt)).toBe('2026-10-16T08:00:00.000Z')
            expect(automation().lockedBy).toBeUndefined()
            expect(automation().lastRunStatus).toBe('paused')
            expect(String(automation().activeRunId)).toBe(String(runs().docs[0]._id))
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
        const start = (now: Date, worker = 'w1') => container.resolve(StartAutomationRunUseCase).execute({ automationId: id, workerId: worker, now, leaseMs: LEASE })

        it('runs at once without moving the next run', async () => {
            const before = at(automation().nextRunAt)

            const { data } = await start(new Date('2026-10-14T07:10:00Z'))

            expect(data.run).toMatchObject({ status: 'running', trigger: 'manual' })
            expect(at(automation().nextRunAt)).toBe(before)
            expect(automation().lockedBy).toBe('w1')
        })

        it('is refused while the automation is running and allowed after', async () => {
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

        it('fails for an automation that does not exist', async () => {
            await expect(container.resolve(StartAutomationRunUseCase).execute({ automationId: new ObjectId().toHexString(), workerId: 'w1' })).rejects.toThrow(/not found/)
        })
    })

    describe('syncing every open run', () => {
        it('settles the paused runs that finished and the runs that lost their worker', async () => {
            const { data } = await claim('w1', new Date('2026-10-14T08:00:00Z'))
            const chatId = await seedChat({ status: 'idle' })
            Object.assign(runs().docs[0], { chatId, status: 'paused' })
            Object.assign(automation(), { lockedBy: undefined, lockedUntil: undefined })
            const lost = await runs().insertOne({ automationId: new ObjectId(), ownerId: new ObjectId(OWNER), status: 'running', startedAt: new Date('2026-10-14T08:00:00Z'), __v: 1 })

            const result = await container.resolve(SyncAutomationRunsUseCase).execute({ now: new Date('2026-10-14T09:00:00Z') })

            expect(result.data).toEqual({ checked: 2, settled: 2 })
            expect(runs().docs.find(run => String(run._id) === String(data.claimed[0].run._id))!.status).toBe('completed')
            expect(runs().docs.find(run => String(run._id) === String(lost.insertedId))!.status).toBe('failed')
        })
    })
})
