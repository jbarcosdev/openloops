import 'reflect-metadata'
import { container } from 'tsyringe'
import { CurrentUser } from '@common/base'
import { inputGuards } from '@guardrails/index'
import { createAgenticJobRunner } from '@services/agentic-jobs/runner/agentic-job-runner'
import { CreateAgenticJobUseCase } from '@services/agentic-jobs/use-cases/create-agentic-job.use-case'
import { SyncAgenticJobRunUseCase } from '@services/agentic-jobs/use-cases/sync-agentic-job-run.use-case'
import { useHarness, warehouseTools, fakeMcp, say, act } from '../support'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : key === 'INTERNAL_MCP_TOKEN' ? 'service-token' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const HOUR = 60 * 60 * 1000

const jobs = () => fakeMongo.collection('agentic_jobs')
const runs = () => fakeMongo.collection('agentic_job_runs')

describe('the runner of agentic jobs', () => {
    const env = useHarness()
    let owner: CurrentUser

    const createJob = async (extra: Record<string, any> = {}, due = true) => {
        const { data } = await container.resolve(CreateAgenticJobUseCase).execute({
            payload: {
                name: 'Report',
                instructions: 'Summarize my open tickets',
                recurrence: { type: 'daily', time: '08:00' },
                timezone: 'UTC',
                modelProvider: 'anthropic',
                modelName: 'claude-haiku-5-5',
                ...extra,
            } as any,
            currentUser: owner,
        })

        if (due) jobs().docs.find(doc => String(doc._id) === String(data._id))!.nextRunAt = new Date(Date.now() - HOUR)

        return String(data._id)
    }

    beforeEach(() => {
        fakeMongo.reset()
        owner = env.user
        jest.spyOn(CurrentUser, 'asyncFromDB').mockResolvedValue(owner)
    })

    afterEach(() => jest.restoreAllMocks())

    describe('running what is due', () => {
        it('runs the job as an autonomous run, in a new chat, with the model of the job', async () => {
            env.llm.script(say('Here is the report'))
            await createJob()
            const runner = createAgenticJobRunner({ workerId: 'w1' })

            await runner.tick()
            await runner.stop()

            const [run] = runs().docs
            const [chat] = env.db.chats.all()

            expect(run).toMatchObject({ status: 'completed', trigger: 'schedule', workerId: 'w1' })
            expect(String(run.chatId)).toBe(String(chat._id))
            expect(chat.settings).toMatchObject({ executionMode: 'autonomous', modelProvider: 'anthropic', modelName: 'claude-haiku-5-5', loopName: 'agi' })
            expect(env.llm.opening(0).CONTEXT.execution_mode).toBe('autonomous')
            expect(env.llm.opening(0).INPUT.user_message).toBe('Summarize my open tickets')
            expect(env.fast.calls).toBe(0)
            expect(jobs().docs[0]).toMatchObject({ lastRunStatus: 'completed' })
            expect(jobs().docs[0].lockedBy).toBeUndefined()
        })

        it('uses the options of the agent that the integrator gave', async () => {
            const w = warehouseTools()
            env.llm.script({ actions: [act('t_get', { id: 'a1' })] }, say('done'))
            await createJob()
            const runner = createAgenticJobRunner({ agent: { tools: w.tools, maxIterations: 10 } })

            await runner.tick()
            await runner.stop()

            expect(w.gets).toEqual(['a1'])
            expect(runs().docs[0].status).toBe('completed')
        })

        describe('with internal MCPs', () => {
            const sofi = { name: 'sofi', url: 'https://api.sofi.app/mcp', headers: { Authorization: 'Bearer {{token}}' } }

            afterEach(() => { delete process.env.INTERNAL_MCP_TOKEN })

            it('gives them the service token and the id of the owner of the job', async () => {
                process.env.INTERNAL_MCP_TOKEN = 'encrypted-or-not'
                fakeMcp.setInternal([{ name: 'sofi' }])
                env.llm.script({ actions: [act('search_tools', { server: 'sofi' })] }, say('done'))
                await createJob()
                const runner = createAgenticJobRunner({ agent: { internalMcps: [sofi] } })

                await runner.tick()
                await runner.stop()

                expect(fakeMcp.connectHeaders.sofi).toEqual({ Authorization: 'Bearer service-token', 'X-User-Id': owner.userId })
                expect(runs().docs[0].status).toBe('completed')
            })

            it('leaves them unavailable, without failing the run, when there is no service token', async () => {
                fakeMcp.setInternal([{ name: 'sofi' }])
                env.llm.script(say('done'))
                await createJob()
                const runner = createAgenticJobRunner({ agent: { internalMcps: [sofi] } })

                await runner.tick()
                await runner.stop()

                expect(fakeMcp.connectAttempts).toEqual({})
                expect(env.llm.opening(0).CONTEXT.unavailable_sources).toEqual(['sofi'])
                expect(runs().docs[0].status).toBe('completed')
            })
        })

        it('asks for the options of every job when they are given by a function', async () => {
            env.llm.script(say('done'))
            const id = await createJob()
            const seen: any[] = []
            const runner = createAgenticJobRunner({ agent: ({ job, currentUser }) => { seen.push([String(job._id), currentUser.userId]); return {} } })

            await runner.tick()
            await runner.stop()

            expect(seen).toEqual([[id, owner.userId]])
        })

        it('does not repeat a run that failed until the next occurrence', async () => {
            env.llm.script({ throws: new Error('provider is down') })
            await createJob()
            const runner = createAgenticJobRunner()

            await runner.tick()
            await runner.stop()
            await runner.tick()
            await runner.stop()

            expect(runs().docs).toHaveLength(1)
            expect(runs().docs[0]).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('provider is down') } })
            expect(jobs().docs[0].lastRunStatus).toBe('failed')
            expect(env.llm.calls).toHaveLength(1)
        })

        it('records a run that was blocked by a guardrail as failed', async () => {
            await createJob({ instructions: 'Charge the card 4242 4242 4242 4242' })
            const runner = createAgenticJobRunner({ agent: { guards: [inputGuards.blockCard] } })

            await runner.tick()
            await runner.stop()

            expect(runs().docs[0]).toMatchObject({ status: 'failed', error: { code: 'BLOCKED_BY_GUARDRAIL' } })
            expect(env.llm.calls).toHaveLength(0)
        })

        it('fails when the owner of the job does not exist', async () => {
            jest.spyOn(CurrentUser, 'asyncFromDB').mockResolvedValue(undefined)
            await createJob()
            const runner = createAgenticJobRunner()

            await runner.tick()
            await runner.stop()

            expect(runs().docs[0]).toMatchObject({ status: 'failed', error: { code: 'OWNER_NOT_FOUND' } })
            expect(jobs().docs[0].enabled).toBe(true)
        })

        it('does not start more runs than it can run at once', async () => {
            env.llm.script(say('one'), say('two'))
            await createJob({ name: 'A' })
            await createJob({ name: 'B' })
            const runner = createAgenticJobRunner({ maxConcurrentRuns: 1 })

            await runner.tick()
            await runner.stop()
            expect(runs().docs).toHaveLength(1)

            await runner.tick()
            await runner.stop()
            expect(runs().docs).toHaveLength(2)
        })

        it('leaves a job to only one of several runners', async () => {
            env.llm.script(say('done'), say('done again'))
            await createJob()
            const first = createAgenticJobRunner({ workerId: 'pod-1' })
            const second = createAgenticJobRunner({ workerId: 'pod-2' })

            await Promise.all([first.tick(), second.tick()])
            await Promise.all([first.stop(), second.stop()])

            expect(runs().docs).toHaveLength(1)
            expect(env.llm.calls).toHaveLength(1)
        })

        it('tells the integrator how every run ended', async () => {
            env.llm.script(say('done'))
            await createJob()
            const finished: any[] = []
            const runner = createAgenticJobRunner({ onRunFinished: async event => { finished.push(event) } })

            await runner.tick()
            await runner.stop()

            expect(finished).toHaveLength(1)
            expect(finished[0].job.name).toBe('Report')
            expect(finished[0].run.status).toBe('completed')
            expect(finished[0].chat.lastAnswer).toBe('done')
        })

        it('is not stopped by a callback that throws', async () => {
            env.llm.script(say('done'))
            await createJob()
            const runner = createAgenticJobRunner({ onRunFinished: () => { throw new Error('mail server down') } })

            await runner.tick()
            await runner.stop()

            expect(runs().docs[0].status).toBe('completed')
        })
    })

    describe('a run that needs the user', () => {
        it('stays paused and is completed when the user answers in the chat', async () => {
            const w = warehouseTools()
            env.approval.question = 'Do you want me to delete item 9?'
            env.llm.script({ actions: [act('t_delete', { id: '9' })] }, say('Item 9 deleted'))
            await createJob()
            const runner = createAgenticJobRunner({ agent: { tools: w.tools } })

            await runner.tick()
            await runner.stop()

            expect(runs().docs[0].status).toBe('paused')
            expect(jobs().docs[0]).toMatchObject({ lastRunStatus: 'paused' })
            expect(w.deleted).toEqual([])

            const chatId = String(runs().docs[0].chatId)
            const answered = await env.send(env.agent(w.tools), 'yes, delete it', chatId)
            expect(answered.data.state.status).toBe('idle')
            expect(w.deleted).toEqual(['9'])

            const { data } = await container.resolve(SyncAgenticJobRunUseCase).execute({ runId: String(runs().docs[0]._id) })

            expect(data?.status).toBe('completed')
            expect(jobs().docs[0].lastRunStatus).toBe('completed')
        })

        it('makes the next occurrence be skipped and tells the integrator', async () => {
            const w = warehouseTools()
            env.llm.script({ actions: [act('t_delete', { id: '9' })] })
            await createJob()
            const finished: any[] = []
            const runner = createAgenticJobRunner({ agent: { tools: w.tools }, onRunFinished: event => { finished.push(event.run.status) } })

            await runner.tick()
            await runner.stop()
            jobs().docs[0].nextRunAt = new Date(Date.now() - 1000)
            await runner.tick()
            await runner.stop()

            expect(runs().docs.map(run => run.status)).toEqual(['paused', 'skipped'])
            expect(finished).toEqual(['paused', 'skipped'])
            expect(env.llm.calls).toHaveLength(1)
        })
    })

    describe('running by hand', () => {
        it('starts at once, returns the run and keeps the schedule', async () => {
            env.llm.script(say('Manual report'))
            const id = await createJob({}, false)
            const next = String(jobs().docs[0].nextRunAt)
            const runner = createAgenticJobRunner()

            const { run } = await runner.runNow({ jobId: id })

            expect(run).toMatchObject({ status: 'running', trigger: 'manual' })

            await runner.stop()

            expect(runs().docs[0]).toMatchObject({ status: 'completed', trigger: 'manual' })
            expect(String(jobs().docs[0].nextRunAt)).toBe(next)
        })

        it('is refused while the job is running', async () => {
            env.llm.script(say('done'))
            const id = await createJob({}, false)
            const runner = createAgenticJobRunner({ workerId: 'w1' })

            await runner.runNow({ jobId: id })
            await expect(createAgenticJobRunner({ workerId: 'w2' }).runNow({ jobId: id })).rejects.toThrow(/already running/)

            await runner.stop()
        })
    })

    describe('the loop', () => {
        beforeEach(() => jest.useFakeTimers())
        afterEach(() => jest.useRealTimers())

        it('checks right away, then every interval, and stops when asked', async () => {
            env.llm.script(say('first'), say('second'))
            await createJob()
            const runner = createAgenticJobRunner({ intervalMs: 60000 })

            runner.start()
            await jest.advanceTimersByTimeAsync(0)
            await jest.advanceTimersByTimeAsync(10)
            expect(runs().docs).toHaveLength(1)

            jobs().docs[0].nextRunAt = new Date(Date.now() - 1000)
            await jest.advanceTimersByTimeAsync(60000)
            expect(runs().docs).toHaveLength(2)

            await runner.stop()
            jobs().docs[0].nextRunAt = new Date(Date.now() - 1000)
            await jest.advanceTimersByTimeAsync(180000)
            expect(runs().docs).toHaveLength(2)
        })
    })
})
