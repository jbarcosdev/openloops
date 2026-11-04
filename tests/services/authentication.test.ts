import { ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'
import { login, refreshSession, logout, issuePasswordResetToken, resetPassword, revokeUserSessions, verifySessionToken, TokenError } from '@services/authentication'
import { hashToken } from '@services/authentication/helpers/tokens'
import { changePassword, updateUser } from '@services/users'
import { UserPassword } from '@services/users/entities/user-password.value-object'
import { fakeMongo } from '../support/fake-mongo-client'

jest.mock('@common/utils/secret-manager', () => ({ secretManager: { get: (key: string): string => key === 'OPENLOOPS_DB_NAME' ? 'openloops-test' : key === 'JWT_SECRET' ? 'test-secret' : '' } }))
jest.mock('@common/repositories', () => jest.requireActual('@common/repositories'))
jest.mock('@common/repositories/mongo-db.client', () => ({
    MongoClient: class {},
    getMongoDBClient: () => require('../support/fake-mongo-client').fakeMongo,
}))

const DAY = 24 * 60 * 60 * 1000
const SECRET = 'test-secret'
const PASSWORD = 'Secret123.'

const users = () => fakeMongo.collection('users')
const tokens = () => fakeMongo.collection('refresh_tokens')
const revoked = () => fakeMongo.collection('revoked_tokens')

let userId: string
let adminId: string

const seed = async () => {
    const password = await UserPassword.create(PASSWORD)
    userId = (await users().insertOne({ email: 'ana@mail.com', username: 'ana', firstName: 'Ana', lastName: 'Gomez', role: 'user', password })).insertedId.toHexString()
    adminId = (await users().insertOne({ email: 'root@mail.com', firstName: 'Root', role: 'admin', password })).insertedId.toHexString()
}

const signIn = (emailOrUsername = 'ana@mail.com', password = PASSWORD) => login({ payload: { emailOrUsername, password } })
const catchError = async (promise: Promise<unknown>): Promise<any> => {
    try {
        await promise
    } catch (error) {
        return error
    }
}

describe('authentication', () => {
    beforeEach(async () => {
        fakeMongo.reset()
        await seed()
    })

    describe('login', () => {
        it('gives an access token of one hour with the session id and a refresh token that is stored only as a hash', async () => {
            const result = await signIn()
            const claims: any = jwt.verify(result.accessToken, SECRET)

            expect(claims).toMatchObject({ iss: 'openloops', aud: 'session', sub: userId, email: 'ana@mail.com', firstName: 'Ana' })
            expect(claims.exp - claims.iat).toBe(3600)
            expect(claims.sid).toBe(tokens().docs[0].familyId)
            expect(result.expiresIn).toBe(3600)
            expect(tokens().docs[0].tokenHash).toBe(hashToken(result.refreshToken))
            expect(JSON.stringify(tokens().docs)).not.toContain(result.refreshToken)
            expect(result.user).toMatchObject({ email: 'ana@mail.com' })
            expect(result.user).not.toHaveProperty('password')
        })

        it('accepts the username and answers the same 401 for an unknown user and for a wrong password', async () => {
            await expect(signIn('ana')).resolves.toBeDefined()

            const unknown = await catchError(signIn('nobody@mail.com'))
            const wrong = await catchError(signIn('ana@mail.com', 'wrong'))

            expect(unknown).toMatchObject({ statusCode: 401, errorMessage: '{{invalid_credentials}}' })
            expect(wrong).toMatchObject({ statusCode: 401, errorMessage: '{{invalid_credentials}}' })
        })

        it('answers 400 without credentials', async () => {
            await expect(login({ payload: { emailOrUsername: 'ana@mail.com' } })).rejects.toMatchObject({ statusCode: 400 })
            await expect(login({})).rejects.toMatchObject({ statusCode: 400 })
        })

        it('gives 30 days to the refresh token with a limit of 90, and 7 days to an admin', async () => {
            await signIn()
            await signIn('root@mail.com')
            const [user, admin] = tokens().docs

            expect(user.expiresAt.getTime() - Date.now()).toBeGreaterThan(29.9 * DAY)
            expect(user.absoluteExpiresAt.getTime() - Date.now()).toBeGreaterThan(89.9 * DAY)
            expect(admin.expiresAt.getTime() - Date.now()).toBeLessThan(7.1 * DAY)
            expect(admin.absoluteExpiresAt.getTime()).toBe(admin.expiresAt.getTime())
        })
    })

    describe('refresh', () => {
        it('rotates the refresh token and keeps the same session', async () => {
            const first = await signIn()
            const second = await refreshSession({ refreshToken: first.refreshToken })

            expect(second.refreshToken).not.toBe(first.refreshToken)
            expect(tokens().docs).toHaveLength(2)
            expect(tokens().docs[1].familyId).toBe(tokens().docs[0].familyId)
            expect(tokens().docs[0].usedAt).toBeDefined()
            expect((jwt.verify(second.accessToken, SECRET) as any).sid).toBe(tokens().docs[0].familyId)
        })

        it('rejects an unknown, empty or non string token', async () => {
            await expect(refreshSession({ refreshToken: 'nope' })).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: '' })).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({})).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: { $gt: '' } as any })).rejects.toMatchObject({ statusCode: 401 })
        })

        it('rejects an expired refresh token', async () => {
            const first = await signIn()
            tokens().docs[0].expiresAt = new Date(Date.now() - 1000)

            await expect(refreshSession({ refreshToken: first.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
        })

        it('accepts a retry with the old token inside the grace period', async () => {
            const first = await signIn()
            await refreshSession({ refreshToken: first.refreshToken })

            await expect(refreshSession({ refreshToken: first.refreshToken })).resolves.toMatchObject({ expiresIn: 3600 })
            expect(tokens().docs.every(doc => !doc.revokedAt)).toBe(true)
        })

        it('treats the reuse of an old token after the grace period as theft and revokes the whole session, but not another one', async () => {
            const phone = await signIn()
            const tablet = await signIn()
            const renewed = await refreshSession({ refreshToken: phone.refreshToken })
            tokens().docs[0].usedAt = new Date(Date.now() - 60 * 1000)

            await expect(refreshSession({ refreshToken: phone.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: renewed.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: tablet.refreshToken })).resolves.toBeDefined()
        })

        it('lets only one of two simultaneous refreshes claim the token', async () => {
            const first = await signIn()

            const [a, b] = await Promise.allSettled([refreshSession({ refreshToken: first.refreshToken }), refreshSession({ refreshToken: first.refreshToken })])

            expect(a.status).toBe('fulfilled')
            expect(b.status).toBe('fulfilled')
            expect(tokens().docs.filter(doc => doc.usedAt)).toHaveLength(1)
        })

        it('revokes the session when the user no longer exists', async () => {
            const first = await signIn()
            users().docs.splice(0, 1)

            await expect(refreshSession({ refreshToken: first.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
            expect(tokens().docs.every(doc => doc.revokedAt)).toBe(true)
        })
    })

    describe('logout', () => {
        it('revokes the session so its tokens stop working', async () => {
            const first = await signIn()

            await logout({ refreshToken: first.refreshToken })

            await expect(refreshSession({ refreshToken: first.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
        })

        it('ignores an unknown or missing token', async () => {
            await expect(logout({ refreshToken: 'nope' })).resolves.toBeUndefined()
            await expect(logout({})).resolves.toBeUndefined()
        })
    })

    describe('revoking every session of a user', () => {
        it('stops all of them, and can keep the current one', async () => {
            const phone = await signIn()
            const tablet = await signIn()
            const keep = tokens().docs[1].familyId

            await revokeUserSessions({ userId, now: new Date(), exceptFamilyId: keep })

            await expect(refreshSession({ refreshToken: phone.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: tablet.refreshToken })).resolves.toBeDefined()
        })
    })

    describe('the access token', () => {
        it('is read by the backend with verifySessionToken', async () => {
            const { accessToken } = await signIn()

            expect(verifySessionToken(accessToken)).toMatchObject({ userId, email: 'ana@mail.com', firstName: 'Ana', sessionId: tokens().docs[0].familyId })
        })

        it('is compatible with a token that another backend signs with the same convention', () => {
            const foreign = jwt.sign({ email: 'ana@mail.com', sid: 'family-1' }, SECRET, { issuer: 'openloops', audience: 'session', subject: userId, expiresIn: 3600 })

            expect(verifySessionToken(foreign)).toMatchObject({ userId, sessionId: 'family-1' })
        })

        it('rejects a token of another audience, without issuer, signed by another secret, expired or not a token', () => {
            const reset = jwt.sign({}, SECRET, { issuer: 'openloops', audience: 'password-reset', subject: userId })
            const noIssuer = jwt.sign({}, SECRET, { audience: 'session', subject: userId })
            const legacy = jwt.sign({ userId }, SECRET)
            const forged = jwt.sign({}, 'other-secret', { issuer: 'openloops', audience: 'session', subject: userId })
            const expired = jwt.sign({}, SECRET, { issuer: 'openloops', audience: 'session', subject: userId, expiresIn: -10 })

            for (const token of [reset, noIssuer, legacy, forged, 'nope', undefined, '']) expect(() => verifySessionToken(token)).toThrow(TokenError)
            expect(() => verifySessionToken(expired)).toThrow(expect.objectContaining({ reason: 'expired' }))
        })
    })

    describe('password reset', () => {
        it('issues a token of 15 minutes for the user, and nothing for an unknown one', async () => {
            const issued = await issuePasswordResetToken({ payload: { emailOrUsername: 'ana@mail.com' } })
            const claims: any = jwt.verify(issued!.token, SECRET)

            expect(claims).toMatchObject({ iss: 'openloops', aud: 'password-reset', sub: userId })
            expect(claims.exp - claims.iat).toBe(900)
            expect(claims.jti).toBeDefined()
            expect(issued!.user).not.toHaveProperty('password')
            await expect(issuePasswordResetToken({ payload: { emailOrUsername: 'nobody@mail.com' } })).resolves.toBeNull()
            await expect(issuePasswordResetToken({})).rejects.toMatchObject({ statusCode: 400 })
        })

        it('changes the password once and closes every session', async () => {
            const session = await signIn()
            const { token } = (await issuePasswordResetToken({ payload: { emailOrUsername: 'ana@mail.com' } }))!

            await resetPassword({ token, password: 'NewSecret456.' })

            await expect(signIn('ana@mail.com', 'NewSecret456.')).resolves.toBeDefined()
            await expect(signIn('ana@mail.com', PASSWORD)).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: session.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
            expect(revoked().docs).toHaveLength(1)
            await expect(resetPassword({ token, password: 'Another789.' })).rejects.toMatchObject({ statusCode: 401 })
        })

        it('rejects a session token, an expired token, a token for a user that does not exist and a missing password', async () => {
            const { accessToken } = await signIn()
            const expired = jwt.sign({}, SECRET, { issuer: 'openloops', audience: 'password-reset', subject: userId, jwtid: 'a', expiresIn: -10 })
            const orphan = jwt.sign({}, SECRET, { issuer: 'openloops', audience: 'password-reset', subject: new ObjectId().toHexString(), jwtid: 'b' })
            const valid = (await issuePasswordResetToken({ payload: { emailOrUsername: 'ana@mail.com' } }))!.token

            for (const token of [accessToken, expired, orphan, undefined]) await expect(resetPassword({ token, password: 'NewSecret456.' })).rejects.toMatchObject({ statusCode: 401 })
            await expect(resetPassword({ token: valid })).rejects.toMatchObject({ statusCode: 400 })
            expect(revoked().docs).toHaveLength(0)
        })
    })

    describe('changing the password', () => {
        it('closes the other sessions and keeps the current one', async () => {
            const phone = await signIn()
            const tablet = await signIn()
            const current = tokens().docs[1].familyId

            await changePassword({ id: userId, password: 'NewSecret456.', sessionId: current, currentUser: { userId, isAdmin: () => false } as any })

            await expect(refreshSession({ refreshToken: phone.refreshToken })).rejects.toMatchObject({ statusCode: 401 })
            await expect(refreshSession({ refreshToken: tablet.refreshToken })).resolves.toBeDefined()
            await expect(signIn('ana@mail.com', 'NewSecret456.')).resolves.toBeDefined()
        })

        it('is the only way to change it: the update of the user refuses a password', async () => {
            await expect(updateUser({ id: userId, payload: { password: 'NewSecret456.' } as any, currentUser: { userId, isAdmin: () => false } as any })).rejects.toMatchObject({ statusCode: 400 })
            await expect(changePassword({ id: userId, currentUser: { userId, isAdmin: () => false } as any })).rejects.toMatchObject({ statusCode: 400 })
        })

        it('answers 404 for a user that is not the one of the scope', async () => {
            await expect(changePassword({ id: adminId, password: 'NewSecret456.', currentUser: { userId, isAdmin: () => false } as any })).rejects.toMatchObject({ statusCode: 404 })
        })
    })
})
