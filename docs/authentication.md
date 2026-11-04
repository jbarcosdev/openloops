# Authentication

`openloops` logs a user in against its own user records and issues the tokens of the session. It also issues the tokens to reset a password and the tokens of [event automations](automations.md#the-token), all with the same convention. Verifying the token on each request and deciding who may call what is up to your backend, with `verifySessionToken` to read it.

```typescript
import { login, refreshSession, logout, issuePasswordResetToken, resetPassword, revokeUserSessions, revokeToken, isTokenRevoked, verifySessionToken } from 'openloops/authentication'
import { changePassword } from 'openloops/users'
```

`JWT_SECRET` must be set. See [configuration](configuration.md).

**Rate limit is yours.** `openloops` does not limit the attempts to log in, to ask for a reset or to use a token. Your backend must do it before it calls `login` and `issuePasswordResetToken`, by account and by address, and answer 429 when the limit is reached.

## The tokens

Every token is a JWT signed with `HS256` and `JWT_SECRET`, and carries the same claims:

| Claim | Value |
| --- | --- |
| `iss` | `openloops`. A token without it, or with another one, is refused. |
| `aud` | What the token is for: `session`, `password-reset` or `automation-event`. A token is only valid for its own audience. |
| `sub` | The id of the user, or the id of the automation for an event token. |
| `jti` | A unique id, only in the tokens that can be revoked one by one: reset and event tokens. |
| `exp` | When it stops working. |

| Token | Audience | Duration | Extra claims |
| --- | --- | --- | --- |
| Access of a session | `session` | 1 hour | `email`, `firstName`, `lastName`, `sid` (the id of the session) |
| Reset of the password | `password-reset` | 15 minutes | `jti` |
| Event of an automation | `automation-event` | The one you choose, or none | `jti`, `v` |

The refresh token is not a JWT: it is a random string, and only its hash is stored.

## Logging in

```typescript
const result = await login({
    payload: {
        emailOrUsername: 'jose@openloops.xyz',
        password: 'a-real-password',
    },
})

result.accessToken
result.refreshToken
result.expiresIn
result.refreshExpiresAt
result.user
```

- `accessToken` lasts 1 hour. `refreshToken` lasts 30 days for a user and 7 days for an admin, and a session cannot be extended beyond 90 days (7 for an admin), no matter how often it is refreshed.
- `user` is the user record without the password.
- A missing field fails with 400. An unknown user and a wrong password fail with the same 401, so the answer does not tell which accounts exist.

## Keeping the session

```typescript
const next = await refreshSession({ refreshToken })
```

- It gives a new access token and a new refresh token, and the old refresh token cannot be used again. All of them belong to one session.
- A refresh token that was used is accepted again for 10 seconds, to survive a retry of the client. Later than that, it is taken as stolen: the whole session is closed and the next refresh fails with 401.
- It fails with 401 for an unknown, expired or revoked token, and when the user no longer exists.
- Two refreshes at the same time with the same token do not create two sessions.

```typescript
await logout({ refreshToken })
```

Closes the session of that refresh token. An unknown or missing token is ignored.

```typescript
await revokeUserSessions({ userId, now: new Date(), exceptFamilyId })
```

Closes every session of the user, except the one you name. `changePassword` and `resetPassword` do it for you.

## From a token to a `CurrentUser`

Your backend reads the access token, and builds the `CurrentUser` that every other call needs:

```typescript
import { verifySessionToken } from 'openloops/authentication'
import { CurrentUser } from 'openloops/base'

const claims = verifySessionToken(token)
const currentUser = await CurrentUser.asyncFromDB(claims.userId)
```

`verifySessionToken` throws a `TokenError` whose `reason` is `invalid` or `expired`. It refuses a token of another audience, so a reset token or an event token cannot be used as a session. See [users](users.md).

## Resetting a password

`openloops` does not send emails. It issues the token, and your backend sends the link:

```typescript
const issued = await issuePasswordResetToken({ payload: { emailOrUsername } })

if (issued) await sendEmail(issued.user.email, `https://example.com/reset?token=${issued.token}`)
```

- It answers `null` when the user does not exist. Answer the same to the client in both cases, so nobody can learn which accounts exist.
- The token lasts 15 minutes and works once.

```typescript
await resetPassword({ token, password })
```

- It fails with 401 for a token that is invalid, expired, already used, or that is not a reset token, and with 400 if there is no password.
- It changes the password and closes every session of the user.

```typescript
await changePassword({ id, password, sessionId, currentUser })
```

For a user that changes their own password while logged in. It closes the other sessions and keeps the one in `sessionId` (the `sessionId` that `verifySessionToken` gives). `updateUser` refuses a `password`: this is the only way to change it.

## Revoked tokens

A signed token cannot be taken back, so `openloops` keeps a list of the ids (`jti`) of the tokens that must stop working, in the collection `revoked_tokens`.

```typescript
const isFirstTime = await revokeToken({ payload: { jti, audience: 'automation-event', subject: automationId, expiresAt } })

const data = await isTokenRevoked({ jti })

data.revoked
```

- Revoking the same `jti` twice does nothing and answers `false`. `expiresAt` is optional: when it is set, the entry is deleted by itself on that date, which is when the token would have stopped working anyway.
- Reset tokens use it so they work once, and event tokens use it through `revokeAutomationEventToken`.
- The access token of a session has no `jti`: to cut a session, close it with `logout` or `revokeUserSessions`. The access token still works until it expires, at most one hour.

## Collections

`refresh_tokens` and `revoked_tokens` are created by `ensureIndexes` (see [configuration](configuration.md)). If another backend shares the database and uses the same convention, both read and write the same documents.
