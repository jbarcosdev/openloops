# User management

`openloops` includes its own user management, so you don't need to build a parallel system just to have an identity to hand the `Agent`.

```typescript
import { createUser, getUserById, updateUser, deleteUser, ListUsersByProps, UserRole } from 'openloops/users'
import { CurrentUser } from 'openloops/base'
```

## `CurrentUser`

Every call into `openloops`, whether running an agent, managing MCP servers or checking usage, needs a `CurrentUser`. Build one from a stored user id:

```typescript
const currentUser = await CurrentUser.asyncFromDB(userId)
```

It returns `undefined` when the user does not exist. A `CurrentUser` knows its role, so `currentUser.isAdmin()` decides what the use cases let it do: only admins can hard delete, and fields such as the version, owner and audit dates are only editable by them.

To log a user in and get a token, see [authentication](authentication.md).

## Creating a user

```typescript
const result = await createUser({
    payload: {
        firstName: 'Jose',
        lastName: 'Barcos',
        email: 'jose@openloops.xyz',
        password: 'a-real-password',
        role: UserRole.USER,
    },
    sanitize: false,
})
```

`email` and `password` are required. Passwords are hashed before being stored and are never returned.

### `sanitize`

By default `createUser` removes the fields only admins can set, such as `role`, unless the `currentUser` is an admin. This is what protects you from someone escalating privileges through the payload.

If you send `role`, pass `sanitize: false`, otherwise it is discarded. Do it only when your code builds the payload itself, with the fields you choose. Never pass the raw body of a request from an API.

## Getting a user

```typescript
const result = await getUserById({ id: userId, currentUser })
```

The returned user never includes the password field.

## Listing users

```typescript
const result = await ListUsersByProps({
    where: { firstName: 'Jose' },
    options: { page: 1, limit: 10 },
    currentUser,
})
```

## Updating a user

```typescript
const result = await updateUser({
    id: userId,
    payload: {
        firstName: 'Jose',
        lastName: 'Developer',
    },
    currentUser,
})
```

## Default model

A user can have a preferred model, which is used for the chats they start when no model is chosen in the run.

```typescript
await updateUser({
    id: userId,
    payload: {
        preferences: {
            defaultModel: { provider: 'anthropic', model: 'claude-haiku-5-5' },
        },
    },
    currentUser,
})

await updateUser({ id: userId, payload: { preferences: { defaultModel: null } }, currentUser })
```

- The provider and the model are required together, and the model must exist in the catalog of providers. Otherwise the call fails with an error that says why.
- It does not change the other preferences of the user.
- Sending `null` removes it.
- It only applies to chats that start afterwards, because every chat saves the model it uses. See [configuration](configuration.md#which-model-a-chat-uses).

## Deleting a user

```typescript
await deleteUser({
    id: userId,
    accountDeletionReason: 'User requested account closure',
    currentUser,
})

await deleteUser({
    id: userId,
    accountDeletionReason: 'GDPR request',
    hardDelete: true,
    currentUser,
})
```

The first one is a soft delete, `accountDeletionReason` is optional. A hard delete permanently removes the record and is for admins only.
