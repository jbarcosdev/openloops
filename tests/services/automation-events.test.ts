import { ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'
import { CreateAutomationUseCase } from '@services/automations/use-cases/create-automation.use-case'
import { UpdateAutomationUseCase } from '@services/automations/use-cases/update-automation.use-case'
import { IssueAutomationEventTokenUseCase } from '@services/automations/use-cases/issue-automation-event-token.use-case'
import { RevokeAutomationEventTokenUseCase } from '@services/automations/use-cases/revoke-automation-event-token.use-case'
import { RotateAutomationEventTokensUseCase } from '@services/automations/use-cases/rotate-automation-event-tokens.use-case'
import { ReceiveAutomationEventUseCase } from '@services/automations/use-cases/receive-automation-event.use-case'
import { ClaimQueuedAutomationRunsUseCase } from '@services/automations/use-cases/claim-queued-automation-runs.use-case'
import { FinishAutomationRunUseCase } from '@services/automations/use-cases/finish-automation-run.use-case'
import { AutomationEventError } from '@services/automations/utils/automation-event-error'
import { Scope } from '@common/repositories/scope'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : key === 'JWT_SECRET' ? 'test-secret' : key === 'AUTOMATIONS_MAX_QUEUED_RUNS' ? '3' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const OWNER = new ObjectId().toHexString()
const user: any = { userId: OWNER, isAdmin: () => false }
const stranger: any = { userId: new ObjectId().toHexString(), isAdmin: () => false }
const admin: any = { userId: new ObjectId().toHexString(), isAdmin: () => true }
const NOW = new Date('2026-10-14T12:00:00Z')

const runs = () => fakeMongo.collection('automation_runs')
const automations = () => fakeMongo.collection('automations')
const revoked = () => fakeMongo.collection('revoked_tokens')

const createEvent = async (extra: Record<string, any> = {}) => {
    const data = await new CreateAutomationUseCase().execute({
        payload: { name: 'Cost alerts', instructions: 'Analyze the cost alert', triggers: { event: {} }, ...extra } as any,
        currentUser: user,
    })

    return String(data._id)
}

const issue = async (id: string, expiresIn?: string, currentUser = user) =>
    (await new IssueAutomationEventTokenUseCase().execute({ id, expiresIn, currentUser }))

const receive = (automationId: string, token: string, extra: Record<string, any> = {}) =>
    new ReceiveAutomationEventUseCase().execute({ automationId, token, ...extra })

const rejection = async (promise: Promise<unknown>): Promise<string | undefined> => {
    try {
        await promise
    } catch (error: any) {
        expect(error).toBeInstanceOf(AutomationEventError)
        return error.reason
    }
}

describe('automations with an event trigger', () => {
    beforeEach(() => {
        fakeMongo.reset()
        jest.useFakeTimers({ now: NOW })
    })

    afterEach(() => jest.useRealTimers())

    describe('creating', () => {
        it('has no schedule and starts with the first version of the token', async () => {
            const id = await createEvent()

            expect(automations().docs[0].triggers).toEqual({ event: { enabled: true } })
            expect(automations().docs[0].eventTokenVersion).toBe(1)
            expect(id).toBeTruthy()
        })

        it('can be turned off and on without a next run', async () => {
            const id = await createEvent()
            const update = new UpdateAutomationUseCase()

            const off = await update.execute({ id, payload: { triggers: { event: { enabled: false } } }, currentUser: user })
            const on = await update.execute({ id, payload: { triggers: { event: { enabled: true } } }, currentUser: user })

            expect(off.triggers?.event?.enabled).toBe(false)
            expect(on.triggers).toEqual({ event: { enabled: true } })
            expect(on.eventTokenVersion).toBe(1)
        })
    })

    describe('next to a schedule', () => {
        const both = { triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' }, timezone: 'UTC' }, event: {} } }
        const update = (id: string, payload: Record<string, any>) => new UpdateAutomationUseCase().execute({ id, payload, currentUser: user })

        it('keeps receiving events when the schedule is turned off', async () => {
            const id = await createEvent(both)
            const { token } = await issue(id)

            await update(id, { triggers: { schedule: { enabled: false } } })

            expect((await receive(id, token)).status).toBe('queued')
        })

        it('stops receiving events when only the event is turned off, and the schedule stays', async () => {
            const id = await createEvent(both)
            const { token } = await issue(id)

            await update(id, { triggers: { event: { enabled: false } } })

            expect(await rejection(receive(id, token))).toBe('disabled')
            expect(automations().docs[0].triggers.schedule).toMatchObject({ enabled: true })
            expect(automations().docs[0].triggers.schedule.nextRunAt).toBeInstanceOf(Date)
        })

        it('keeps the old tokens valid when the event is turned off and on again', async () => {
            const id = await createEvent(both)
            const { token } = await issue(id)

            await update(id, { triggers: { event: { enabled: false } } })
            await update(id, { triggers: { event: { enabled: true } } })

            expect((await receive(id, token)).status).toBe('queued')
        })

        it('rejects the old tokens when the event is removed', async () => {
            const id = await createEvent(both)
            const { token } = await issue(id)

            await update(id, { triggers: { event: null } })

            expect(await rejection(receive(id, token))).toBe('invalid')
            await expect(issue(id)).rejects.toThrow(/event trigger/)
        })

        it('keeps rejecting the old tokens when the event is added again', async () => {
            const id = await createEvent(both)
            const old = await issue(id)
            await new RotateAutomationEventTokensUseCase().execute({ id, currentUser: user })
            const rotated = await issue(id)

            await update(id, { triggers: { event: null } })
            await update(id, { triggers: { event: {} } })
            const fresh = await issue(id)

            expect(automations().docs[0].eventTokenVersion).toBe(3)
            expect(await rejection(receive(id, old.token))).toBe('invalid')
            expect(await rejection(receive(id, rotated.token))).toBe('invalid')
            expect((await receive(id, fresh.token)).status).toBe('queued')
        })

        it('rotates the tokens without touching the schedule', async () => {
            const id = await createEvent(both)
            const before = automations().docs[0].triggers.schedule

            const data = await new RotateAutomationEventTokensUseCase().execute({ id, currentUser: user })

            expect(data.eventTokenVersion).toBe(2)
            expect(automations().docs[0].triggers.schedule).toEqual(before)
        })
    })

    describe('the token', () => {
        it('is signed for one automation and does not expire unless asked', async () => {
            const id = await createEvent()
            const { token, expiresAt } = await issue(id)
            const claims = jwt.decode(token) as any

            expect(expiresAt).toBeUndefined()
            expect(claims).toMatchObject({ sub: id, aud: 'automation-event', v: 1 })
            expect(claims.exp).toBeUndefined()
            expect(claims.jti).toBeTruthy()
        })

        it('can be asked again and every one is different and valid', async () => {
            const id = await createEvent()
            const first = await issue(id)
            const second = await issue(id)

            expect(first.token).not.toBe(second.token)
            expect((await receive(id, first.token)).status).toBe('queued')
            expect((await receive(id, second.token)).status).toBe('queued')
        })

        it('expires when it was asked to', async () => {
            const id = await createEvent()
            const { token, expiresAt } = await issue(id, '2h')

            expect(expiresAt?.toISOString()).toBe('2026-10-14T14:00:00.000Z')

            jest.setSystemTime(new Date('2026-10-14T14:00:01Z'))
            expect(await rejection(receive(id, token))).toBe('expired')
        })

        it.each(['0d', '-5h', '10', 'forever', '1.5h'])('rejects the expiration %s', async expiresIn => {
            const id = await createEvent()

            await expect(issue(id, expiresIn)).rejects.toThrow(/positive duration/)
        })

        it('is only given to the owner, or to an admin that asks with an admin scope, and only for an event automation', async () => {
            const id = await createEvent()

            await expect(issue(id, undefined, stranger)).rejects.toMatchObject({ statusCode: 404 })
            await expect(issue(id, undefined, admin)).rejects.toMatchObject({ statusCode: 404 })
            await expect(new IssueAutomationEventTokenUseCase().execute({ id, currentUser: admin, scope: Scope.asAdmin(admin) })).resolves.toMatchObject({ token: expect.any(String) })

            const data = await new CreateAutomationUseCase().execute({
                payload: { name: 'Daily', instructions: 'Do it', triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' }, timezone: 'UTC' } } } as any,
                currentUser: user,
            })

            await expect(issue(String(data._id))).rejects.toThrow(/event trigger/)
        })
    })

    describe('receiving an event', () => {
        it('queues a run with the payload and answers without running anything', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            const data = await receive(id, token, { payload: { alarm: 'cost', amount: 1200 } })

            expect(data.status).toBe('queued')
            expect(runs().docs).toHaveLength(1)
            expect(runs().docs[0]).toMatchObject({ status: 'queued', trigger: 'event', instructions: 'Analyze the cost alert', payload: '{"alarm":"cost","amount":1200}' })
            expect(runs().docs[0].startedAt).toBeUndefined()
        })

        it('keeps a text payload as it came and accepts an event without payload', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            await receive(id, token, { payload: 'plain text alert' })
            await receive(id, token)

            expect(runs().docs[0].payload).toBe('plain text alert')
            expect(runs().docs[1].payload).toBeUndefined()
        })

        it('does not repeat an event that comes again with the same key', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            const first = await receive(id, token, { idempotencyKey: 'alarm-1' })
            const again = await receive(id, token, { idempotencyKey: 'alarm-1' })
            const other = await receive(id, token, { idempotencyKey: 'alarm-2' })

            expect(first.status).toBe('queued')
            expect(again.status).toBe('duplicate')
            expect(String(again.run._id)).toBe(String(first.run._id))
            expect(other.status).toBe('queued')
            expect(runs().docs).toHaveLength(2)
        })

        it('does not deduplicate events without a key', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            await receive(id, token, { payload: 'same' })
            await receive(id, token, { payload: 'same' })

            expect(runs().docs).toHaveLength(2)
        })

        it('records as skipped what exceeds the queue, with its payload', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            for (let i = 0; i < 3; i++) await receive(id, token, { payload: `alert ${i}` })
            const data = await receive(id, token, { payload: 'alert 3', idempotencyKey: 'late' })

            expect(data.status).toBe('skipped')
            expect(runs().docs[3]).toMatchObject({ status: 'skipped', skipReason: 'The queue of this automation is full', payload: 'alert 3' })
            expect(runs().docs[3].idempotencyKey).toBeUndefined()
            expect(runs().docs[3].finishedAt).toBeDefined()
        })

        it('rejects a payload that is too large', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            expect(await rejection(receive(id, token, { payload: 'x'.repeat(50001) }))).toBe('payload_too_large')
            expect(runs().docs).toHaveLength(0)
        })

        it('rejects a key that is too long', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            await expect(receive(id, token, { idempotencyKey: 'k'.repeat(201) })).rejects.toThrow(/idempotency key/)
        })

        it('answers every refusal as unauthorized and keeps the reason apart', async () => {
            const id = await createEvent()
            const other = await createEvent({ name: 'Other' })
            const { token } = await issue(id)

            const login = jwt.sign({ userId: OWNER }, 'test-secret')
            const otherAudience = jwt.sign({ v: 1 }, 'test-secret', { audience: 'something-else', subject: id, jwtid: 'x' })
            const forged = jwt.sign({ v: 1 }, 'another-secret', { audience: 'automation-event', subject: id, jwtid: 'y' })

            const cases: [string, Promise<unknown>][] = [
                ['invalid', receive(id, 'not-a-token')],
                ['invalid', receive(id, login)],
                ['invalid', receive(id, otherAudience)],
                ['invalid', receive(id, forged)],
                ['invalid', receive(other, token)],
            ]

            for (const [reason, promise] of cases) {
                try {
                    await promise
                    throw new Error('it should have been rejected')
                } catch (error: any) {
                    expect(error).toBeInstanceOf(AutomationEventError)
                    expect(error).toMatchObject({ reason, statusCode: 401, message: 'Unauthorized' })
                }
            }

            expect(runs().docs).toHaveLength(0)
        })

        it('rejects an event for an automation that is off, that does not exist or that has another type', async () => {
            const id = await createEvent()
            const { token } = await issue(id)

            await new UpdateAutomationUseCase().execute({ id, payload: { triggers: { event: { enabled: false } } }, currentUser: user })
            expect(await rejection(receive(id, token))).toBe('disabled')

            const missing = new ObjectId().toHexString()
            const orphan = jwt.sign({ v: 1 }, 'test-secret', { issuer: 'openloops', audience: 'automation-event', subject: missing, jwtid: 'z' })
            expect(await rejection(receive(missing, orphan))).toBe('not_found')
        })
    })

    describe('revoking', () => {
        it('stops one leaked token and leaves the others working', async () => {
            const id = await createEvent()
            const leaked = await issue(id)
            const healthy = await issue(id)

            await new RevokeAutomationEventTokenUseCase().execute({ id, token: leaked.token, currentUser: user })

            expect(await rejection(receive(id, leaked.token))).toBe('revoked')
            expect((await receive(id, healthy.token)).status).toBe('queued')
            expect(revoked().docs[0]).toMatchObject({ audience: 'automation-event', subject: id })
        })

        it('is not repeated when the same token is revoked twice', async () => {
            const id = await createEvent()
            const { token } = await issue(id)
            const revoke = new RevokeAutomationEventTokenUseCase()

            await revoke.execute({ id, token, currentUser: user })
            await revoke.execute({ id, token, currentUser: user })

            expect(revoked().docs).toHaveLength(1)
        })

        it('keeps the expiration of the token so the entry can be purged', async () => {
            const id = await createEvent()
            const { token, expiresAt } = await issue(id, '1d')

            await new RevokeAutomationEventTokenUseCase().execute({ id, token, currentUser: user })

            expect(new Date(revoked().docs[0].expiresAt).toISOString()).toBe(expiresAt?.toISOString())
        })

        it('only works with a token of the same automation, and for its owner', async () => {
            const id = await createEvent()
            const other = await createEvent({ name: 'Other' })
            const { token } = await issue(other)
            const revoke = new RevokeAutomationEventTokenUseCase()

            await expect(revoke.execute({ id, token, currentUser: user })).rejects.toThrow(/does not belong/)
            await expect(revoke.execute({ id: other, token, currentUser: stranger })).rejects.toMatchObject({ statusCode: 404 })
            await expect(revoke.execute({ id: other, token: 'junk', currentUser: user })).rejects.toBeInstanceOf(AutomationEventError)
        })
    })

    describe('rotating', () => {
        it('invalidates every token issued before and lets the new ones work', async () => {
            const id = await createEvent()
            const before = await issue(id)

            const data = await new RotateAutomationEventTokensUseCase().execute({ id, currentUser: user })
            const after = await issue(id)

            expect(data.triggers?.event).toEqual({ enabled: true })
            expect(data.eventTokenVersion).toBe(2)
            expect(await rejection(receive(id, before.token))).toBe('invalid')
            expect((await receive(id, after.token)).status).toBe('queued')
        })

        it('is only for the owner', async () => {
            const id = await createEvent()

            await expect(new RotateAutomationEventTokensUseCase().execute({ id, currentUser: stranger })).rejects.toMatchObject({ statusCode: 404 })
        })
    })

    describe('claiming the queue', () => {
        const claim = (workerId = 'w1', limit?: number) => new ClaimQueuedAutomationRunsUseCase().execute({ workerId, limit, now: new Date() })

        it('starts the oldest event of an automation and leaves the rest waiting', async () => {
            const id = await createEvent()
            const { token } = await issue(id)
            await receive(id, token, { payload: 'first' })
            jest.setSystemTime(new Date(NOW.getTime() + 1000))
            await receive(id, token, { payload: 'second' })

            const data = await claim()

            expect(data.claimed).toHaveLength(1)
            expect(data.claimed[0].run).toMatchObject({ status: 'running', payload: 'first', workerId: 'w1' })
            expect(runs().docs.map(run => run.status)).toEqual(['running', 'queued'])
            expect(automations().docs[0]).toMatchObject({ lockedBy: 'w1' })
            expect(String(automations().docs[0].activeRunId)).toBe(String(data.claimed[0].run._id))

            expect((await claim('w2')).claimed).toHaveLength(0)
        })

        it('starts the next event when the previous run finishes', async () => {
            const id = await createEvent()
            const { token } = await issue(id)
            await receive(id, token, { payload: 'first' })
            jest.setSystemTime(new Date(NOW.getTime() + 1000))
            await receive(id, token, { payload: 'second' })

            const first = (await claim()).claimed[0]
            await new FinishAutomationRunUseCase().execute({ runId: String(first.run._id), workerId: 'w1', status: 'completed' })

            const next = (await claim()).claimed

            expect(next).toHaveLength(1)
            expect(next[0].run.payload).toBe('second')
        })

        it('waits while the previous run is paused for the user', async () => {
            const id = await createEvent()
            const { token } = await issue(id)
            await receive(id, token, { payload: 'first' })
            jest.setSystemTime(new Date(NOW.getTime() + 1000))
            await receive(id, token, { payload: 'second' })

            const first = (await claim()).claimed[0]
            await new FinishAutomationRunUseCase().execute({ runId: String(first.run._id), workerId: 'w1', status: 'paused' })

            expect((await claim()).claimed).toHaveLength(0)
            expect(runs().docs[1].status).toBe('queued')
            expect(automations().docs[0].lockedBy).toBeUndefined()
        })

        it('starts one run for each automation and respects the limit', async () => {
            const a = await createEvent({ name: 'A' })
            const b = await createEvent({ name: 'B' })
            await receive(a, (await issue(a)).token)
            await receive(b, (await issue(b)).token)

            expect((await claim('w1', 1)).claimed).toHaveLength(1)
            expect((await claim('w1', 5)).claimed).toHaveLength(1)
        })

        it('skips what was queued for an automation whose event trigger was removed', async () => {
            const id = await createEvent({ triggers: { schedule: { recurrence: { type: 'daily', time: '08:00' }, timezone: 'UTC' }, event: {} } })
            await receive(id, (await issue(id)).token)
            await new UpdateAutomationUseCase().execute({ id, payload: { triggers: { event: null } } as any, currentUser: user })

            const data = await claim()

            expect(data.claimed).toHaveLength(0)
            expect(runs().docs[0]).toMatchObject({ status: 'skipped', skipReason: 'The event trigger of the automation is turned off' })
        })

        it('skips what was queued for an automation that was turned off', async () => {
            const id = await createEvent()
            await receive(id, (await issue(id)).token)
            await new UpdateAutomationUseCase().execute({ id, payload: { triggers: { event: { enabled: false } } }, currentUser: user })

            const data = await claim()

            expect(data.claimed).toHaveLength(0)
            expect(data.skipped).toHaveLength(1)
            expect(runs().docs[0]).toMatchObject({ status: 'skipped', skipReason: 'The event trigger of the automation is turned off' })
        })
    })
})
