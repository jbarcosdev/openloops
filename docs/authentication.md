# Authentication

`openloops` can log a user in against its own user records and issue a token. Verifying that token on each request, and deciding who may call what, is up to your backend.

```typescript
import { login, revokeToken, isTokenRevoked } from 'openloops/authentication'
```

## Logging in

```typescript
const result = await login({
    payload: {
        emailOrUsername: 'jose@openloops.xyz',
        password: 'a-real-password',
    },
})

result.data.token
result.data.user
```

- `token` is a JWT signed with `JWT_SECRET`. Its payload carries `userId`, `email`, `firstName` and `lastName`.
- Tokens last 1 hour for admins and 7 days for everyone else.
- `user` is the user record without the password.
- An unknown user fails with a 404 and a wrong password with a 401.

`JWT_SECRET` must be set. See [configuration](configuration.md).

## From a token to a `CurrentUser`

After your backend verifies the token, build the `CurrentUser` that every other call needs:

```typescript
import { CurrentUser } from 'openloops/base'

const currentUser = await CurrentUser.asyncFromDB(payload.userId)
```

See [users](users.md).

## Revoked tokens

A signed token cannot be taken back, so `openloops` keeps a list of the ids (`jti`) of the tokens that must stop working, in the collection `revoked_tokens`.

```typescript
await revokeToken({ payload: { jti, audience: 'automation-event', subject: automationId, expiresAt }, currentUser })

const { data } = await isTokenRevoked({ jti })

data.revoked
```

- Revoking the same `jti` twice does nothing. `expiresAt` is optional: when it is set, the entry is deleted by itself on that date, which is when the token would have stopped working anyway.
- Today only the tokens of [event automations](automations.md#the-token) use it, through `revokeAutomationEventToken`, and the use case of events checks the list for you.
- The tokens of `login` carry no `jti`, and `openloops` does not verify them, your backend does. To revoke sessions you would add a `jti` when the token is signed and call `isTokenRevoked` in the middleware of your backend. That is not done by the package.

